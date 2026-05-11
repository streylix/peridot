import base64
import json
import time

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from users.models import AppUser
from .models import Note
from .encryption import encrypt_content, decrypt_content, verify_password, encrypt_verification


def make_user(email="test@test.com", password="testpass123"):
    return AppUser.objects.create_user(email=email, password=password)


def make_note(user, **kwargs):
    defaults = {
        "id": int(time.time() * 1000),
        "content": "<div>Test Note</div><div>Some content</div>",
        "date_modified": "2024-01-01T00:00:00Z",
        "pinned": False,
        "locked": False,
        "encrypted": False,
        "item_type": "note",
        "visible_title": "Test Note",
    }
    defaults.update(kwargs)
    return Note.objects.create(user=user, **defaults)


class EncryptionUnitTests(TestCase):
    """Unit tests for server-side encryption module."""

    def test_encrypt_decrypt_roundtrip(self):
        content = "<div>My Secret Note</div>"
        password = "hunter2"
        enc = encrypt_content(content, password)
        self.assertIn("encrypted_content", enc)
        self.assertIn("iv", enc)
        self.assertIn("salt", enc)

        result = decrypt_content(
            enc["encrypted_content"],
            enc["iv"],
            enc["salt"],
            enc["iterations"],
            password,
        )
        self.assertEqual(result, content)

    def test_wrong_password_raises(self):
        enc = encrypt_content("secret", "correctpass")
        with self.assertRaises(ValueError):
            decrypt_content(enc["encrypted_content"], enc["iv"], enc["salt"], enc["iterations"], "wrongpass")

    def test_verification_string(self):
        ver = encrypt_verification("mypassword")
        self.assertTrue(verify_password("mypassword", ver))
        self.assertFalse(verify_password("wrongpass", ver))

    def test_each_encrypt_uses_unique_iv(self):
        enc1 = encrypt_content("hello", "pass")
        enc2 = encrypt_content("hello", "pass")
        self.assertNotEqual(enc1["iv"], enc2["iv"])


class AuthAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()

    def test_login_success(self):
        resp = self.client.post("/api/auth/login/", {"email": "test@test.com", "password": "testpass123"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("email", resp.data)

    def test_login_bad_credentials(self):
        resp = self.client.post("/api/auth/login/", {"email": "test@test.com", "password": "wrong"}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_me_requires_auth(self):
        resp = self.client.get("/api/auth/me/")
        self.assertEqual(resp.status_code, 403)

    def test_me_returns_user(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.get("/api/auth/me/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["email"], self.user.email)

    def test_logout(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/auth/logout/")
        self.assertEqual(resp.status_code, 200)


class NoteCRUDTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()
        self.client.force_authenticate(user=self.user)

    def test_list_notes_empty(self):
        resp = self.client.get("/api/notes/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, [])

    def test_create_note(self):
        note_id = 1700000000000
        resp = self.client.post("/api/notes/", {
            "id": note_id,
            "content": "<div>Hello World</div>",
            "dateModified": "2024-01-01T00:00:00Z",
            "type": "note",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["id"], note_id)
        self.assertEqual(resp.data["visibleTitle"], "Hello World")

    def test_create_note_extracts_preview(self):
        resp = self.client.post("/api/notes/", {
            "id": 1700000000001,
            "content": "<div>Title</div><div>Body line one</div><div>Body line two</div>",
            "dateModified": "2024-01-01T00:00:00Z",
            "type": "note",
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertIn("Body line one", resp.data["previewContent"])

    def test_get_note(self):
        note = make_note(self.user, id=1700000000002)
        resp = self.client.get(f"/api/notes/{note.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["id"], note.id)

    def test_update_note_content(self):
        note = make_note(self.user, id=1700000000003)
        resp = self.client.put(f"/api/notes/{note.id}/", {
            "content": "<div>Updated Title</div>",
            "dateModified": "2024-06-01T00:00:00Z",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["visibleTitle"], "Updated Title")

    def test_update_note_preserves_non_content_derived_visible_title(self):
        note = make_note(
            self.user,
            id=1700000000011,
            content="I figured it out\nBody",
            visible_title="8/22/2024",
        )
        resp = self.client.put(f"/api/notes/{note.id}/", {
            "content": "I figured it out\nBody",
            "dateModified": "2024-06-01T00:00:00Z",
            "visibleTitle": "8/22/2024",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["visibleTitle"], "8/22/2024")

    def test_update_note_allows_explicit_visible_title_change(self):
        note = make_note(
            self.user,
            id=1700000000012,
            content="I figured it out\nBody",
            visible_title="8/22/2024",
        )
        resp = self.client.put(f"/api/notes/{note.id}/", {
            "content": "Renamed\nBody",
            "dateModified": "2024-06-01T00:00:00Z",
            "visibleTitle": "Renamed",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["visibleTitle"], "Renamed")

    def test_delete_note(self):
        note = make_note(self.user, id=1700000000004)
        resp = self.client.delete(f"/api/notes/{note.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Note.objects.filter(id=note.id).exists())

    def test_note_isolation_between_users(self):
        other_user = make_user(email="other@test.com")
        note = make_note(other_user, id=1700000000005)
        resp = self.client.get(f"/api/notes/{note.id}/")
        self.assertEqual(resp.status_code, 404)

    def test_unauthenticated_request_denied(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get("/api/notes/")
        self.assertEqual(resp.status_code, 403)

    def test_create_folder(self):
        resp = self.client.post("/api/notes/", {
            "id": 1700000000006,
            "content": "<div>My Folder</div>",
            "dateModified": "2024-01-01T00:00:00Z",
            "type": "folder",
            "isOpen": False,
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["type"], "folder")

    def test_update_folder_title_from_markdown_content(self):
        folder = make_note(
            self.user,
            id=1700000000010,
            content="Old Folder",
            item_type="folder",
            visible_title="Old Folder",
        )
        resp = self.client.put(f"/api/notes/{folder.id}/", {
            "content": "New Folder",
            "dateModified": "2026-05-11T00:00:00Z",
            "type": "folder",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["content"], "New Folder")
        self.assertEqual(resp.data["visibleTitle"], "New Folder")

    def test_list_notes_only_own(self):
        make_note(self.user, id=1700000000007)
        make_note(self.user, id=1700000000008)
        other_user = make_user(email="other2@test.com")
        make_note(other_user, id=1700000000009)
        resp = self.client.get("/api/notes/")
        self.assertEqual(len(resp.data), 2)


class NoteLockUnlockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()
        self.client.force_authenticate(user=self.user)

    def test_lock_note(self):
        note = make_note(self.user, id=1700000001000, content="<div>Secret</div>")
        resp = self.client.post(f"/api/notes/{note.id}/lock/", {
            "password": "s3cr3t",
            "confirmPassword": "s3cr3t",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["locked"])
        self.assertTrue(resp.data["encrypted"])
        self.assertIsNone(resp.data["content"])  # content not exposed

    def test_lock_requires_matching_passwords(self):
        note = make_note(self.user, id=1700000001001)
        resp = self.client.post(f"/api/notes/{note.id}/lock/", {
            "password": "abc",
            "confirmPassword": "xyz",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_unlock_session_returns_content(self):
        note = make_note(self.user, id=1700000001002, content="<div>My Secret</div>")
        self.client.post(f"/api/notes/{note.id}/lock/", {"password": "pass123"}, format="json")
        resp = self.client.post(f"/api/notes/{note.id}/unlock/", {"password": "pass123"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["success"])
        self.assertEqual(resp.data["note"]["content"], "<div>My Secret</div>")
        # DB still has it encrypted
        note.refresh_from_db()
        self.assertTrue(note.locked)
        self.assertIsNone(note.content)

    def test_unlock_wrong_password(self):
        note = make_note(self.user, id=1700000001003, content="<div>Secret</div>")
        self.client.post(f"/api/notes/{note.id}/lock/", {"password": "correct"}, format="json")
        resp = self.client.post(f"/api/notes/{note.id}/unlock/", {"password": "wrong"}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_unlock_permanent(self):
        note = make_note(self.user, id=1700000001004, content="<div>Perm</div>")
        self.client.post(f"/api/notes/{note.id}/lock/", {"password": "pw"}, format="json")
        resp = self.client.post(f"/api/notes/{note.id}/unlock_permanent/", {"password": "pw"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["locked"])
        self.assertFalse(resp.data["encrypted"])
        note.refresh_from_db()
        self.assertFalse(note.locked)
        self.assertEqual(note.content, "<div>Perm</div>")

    def test_unlock_permanent_preserves_legacy_visible_title_through_noop_save(self):
        legacy = encrypt_content("I figured it out\nBody", "legacy-pass")
        note = make_note(
            self.user,
            id=1700000001012,
            content=None,
            locked=True,
            encrypted=True,
            encrypted_content=legacy["encrypted_content"],
            enc_iv=legacy["iv"],
            enc_salt=legacy["salt"],
            enc_iterations=legacy["iterations"],
            visible_title="8/22/2024",
            preview_content="",
        )

        unlock = self.client.post(
            f"/api/notes/{note.id}/unlock_permanent/",
            {"password": "legacy-pass"},
            format="json",
        )
        self.assertEqual(unlock.status_code, 200)
        self.assertEqual(unlock.data["visibleTitle"], "8/22/2024")

        save = self.client.put(f"/api/notes/{note.id}/", {
            "content": "I figured it out\nBody",
            "visibleTitle": "8/22/2024",
        }, format="json")
        self.assertEqual(save.status_code, 200)
        self.assertEqual(save.data["visibleTitle"], "8/22/2024")

    def test_resave_locked_note_reencrypts(self):
        note = make_note(self.user, id=1700000001005, content="<div>Original</div>")
        self.client.post(f"/api/notes/{note.id}/lock/", {"password": "pw"}, format="json")
        # Simulate frontend sending plaintext + password on save
        resp = self.client.put(f"/api/notes/{note.id}/", {
            "content": "<div>Updated</div>",
            "password": "pw",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["locked"])
        # Verify new content is actually encrypted in DB
        note.refresh_from_db()
        self.assertIsNone(note.content)
        # And can still be unlocked with same password
        resp2 = self.client.post(f"/api/notes/{note.id}/unlock/", {"password": "pw"}, format="json")
        self.assertEqual(resp2.data["note"]["content"], "<div>Updated</div>")

    def test_lock_folder(self):
        folder = make_note(
            self.user, id=1700000001006,
            content="<div>My Folder</div>",
            item_type="folder",
        )
        resp = self.client.post(f"/api/notes/{folder.id}/lock/", {"password": "folderpw"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["locked"])
        # Folder content is NOT encrypted (only verification blob stored)
        folder.refresh_from_db()
        self.assertIsNotNone(folder.ver_ciphertext)

    def test_unlock_folder_correct_password(self):
        folder = make_note(self.user, id=1700000001007, content="<div>F</div>", item_type="folder")
        self.client.post(f"/api/notes/{folder.id}/lock/", {"password": "fp"}, format="json")
        resp = self.client.post(f"/api/notes/{folder.id}/unlock/", {"password": "fp"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["success"])
        self.assertTrue(resp.data["note"]["isOpen"])

    def test_unlock_folder_wrong_password(self):
        folder = make_note(self.user, id=1700000001008, content="<div>F</div>", item_type="folder")
        self.client.post(f"/api/notes/{folder.id}/lock/", {"password": "correct"}, format="json")
        resp = self.client.post(f"/api/notes/{folder.id}/unlock/", {"password": "wrong"}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_rename_locked_folder_updates_plain_folder_content(self):
        folder = make_note(
            self.user,
            id=1700000001009,
            content="Old Locked Folder",
            item_type="folder",
            visible_title="Old Locked Folder",
        )
        self.client.post(f"/api/notes/{folder.id}/lock/", {"password": "fp"}, format="json")
        resp = self.client.put(f"/api/notes/{folder.id}/", {
            "content": "New Locked Folder",
            "password": "fp",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["content"], "New Locked Folder")
        self.assertEqual(resp.data["visibleTitle"], "New Locked Folder")
        folder.refresh_from_db()
        self.assertEqual(folder.content, "New Locked Folder")
        self.assertFalse(folder.encrypted)

    def test_import_legacy_encrypted_note_preserves_cipher_params_and_unlocks(self):
        legacy = encrypt_content("<div>Legacy Secret</div><div>Body</div>", "legacy-pass")
        resp = self.client.post("/api/notes/import_legacy_encrypted/", {
            "id": 1700000001010,
            "content": list(legacy["encrypted_content"]),
            "iv": list(legacy["iv"]),
            "keyParams": {
                "salt": base64.b64encode(legacy["salt"]).decode("ascii"),
                "iterations": legacy["iterations"],
            },
            "locked": True,
            "encrypted": True,
            "visibleTitle": "My locked note",
            "dateModified": "2024-01-01T00:00:00Z",
            "pinned": False,
            "type": "note",
            "parentFolderId": None,
        }, format="json")

        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["locked"])
        self.assertTrue(resp.data["encrypted"])
        self.assertIsNone(resp.data["content"])
        self.assertEqual(resp.data["visibleTitle"], "My locked note")
        self.assertIsNone(resp.data["previewContent"])

        note = Note.objects.get(id=1700000001010)
        self.assertEqual(bytes(note.encrypted_content), legacy["encrypted_content"])
        self.assertEqual(bytes(note.enc_iv), legacy["iv"])
        self.assertEqual(bytes(note.enc_salt), legacy["salt"])
        self.assertEqual(note.enc_iterations, legacy["iterations"])

        unlock = self.client.post(f"/api/notes/{note.id}/unlock/", {"password": "legacy-pass"}, format="json")
        self.assertEqual(unlock.status_code, 200)
        self.assertEqual(unlock.data["note"]["content"], "<div>Legacy Secret</div><div>Body</div>")

    def test_import_legacy_locked_folder_preserves_verification_and_unlocks(self):
        legacy = encrypt_verification("folder-pass")
        resp = self.client.post("/api/notes/import_legacy_encrypted/", {
            "id": 1700000001011,
            "content": "Locked Folder",
            "visibleTitle": "Locked Folder",
            "dateModified": "2024-01-01T00:00:00Z",
            "type": "folder",
            "locked": True,
            "verificationData": {
                "encryptedContent": list(legacy["encrypted_content"]),
                "iv": list(legacy["iv"]),
                "keyParams": {
                    "salt": list(legacy["salt"]),
                    "iterations": legacy["iterations"],
                },
            },
        }, format="json")

        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["locked"])
        self.assertEqual(resp.data["visibleTitle"], "Locked Folder")

        folder = Note.objects.get(id=1700000001011)
        self.assertEqual(bytes(folder.ver_ciphertext), legacy["encrypted_content"])
        self.assertEqual(bytes(folder.ver_iv), legacy["iv"])
        self.assertEqual(bytes(folder.ver_salt), legacy["salt"])

        unlock = self.client.post(f"/api/notes/{folder.id}/unlock/", {"password": "folder-pass"}, format="json")
        self.assertEqual(unlock.status_code, 200)
        self.assertTrue(unlock.data["note"]["isOpen"])
