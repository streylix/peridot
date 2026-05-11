import base64
import binascii
import re

import requests
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from rest_framework.authtoken.models import Token
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .encryption import (
    decrypt_content,
    encrypt_content,
    encrypt_verification,
    verify_password,
)
from .models import Note
from .serializers import NoteSerializer


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([AllowAny])
def auth_login(request):
    username = request.data.get("username", "")
    password = request.data.get("password", "")
    new_password = request.data.get("newPassword", "")
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

    # Allow inline password change during login. Used when must_change_password
    # is set so the client doesn't need a separate authenticated request.
    if new_password:
        if len(new_password) < 6:
            return Response({"error": "New password must be at least 6 characters"}, status=status.HTTP_400_BAD_REQUEST)
        if new_password == password:
            return Response({"error": "New password must differ from current password"}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.must_change_password = False
        user.save()
        # Re-authenticate against the updated password so the session is bound
        # to the new credentials.
        user = authenticate(request, username=username, password=new_password)

    login(request, user)
    # Rotate token on login so previous tokens stop working.
    Token.objects.filter(user=user).delete()
    token = Token.objects.create(user=user)
    return Response({
        "id": str(user.id),
        "username": user.username,
        "must_change_password": user.must_change_password,
        "token": token.key,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def auth_logout(request):
    Token.objects.filter(user=request.user).delete()
    logout(request)
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def auth_me(request):
    u = request.user
    return Response({
        "id": str(u.id),
        "username": u.username,
        "email": getattr(u, "email", ""),
        "must_change_password": u.must_change_password,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def auth_change_password(request):
    user = request.user
    current = request.data.get("currentPassword", "")
    new_password = request.data.get("newPassword", "")
    if not user.check_password(current):
        return Response({"error": "Current password is incorrect"}, status=status.HTTP_400_BAD_REQUEST)
    if not new_password or len(new_password) < 6:
        return Response({"error": "New password must be at least 6 characters"}, status=status.HTTP_400_BAD_REQUEST)
    if new_password == current:
        return Response({"error": "New password must differ from current password"}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(new_password)
    user.must_change_password = False
    user.save()
    # Re-login to refresh session after password change
    login(request, user)
    return Response({"ok": True})


# ---------------------------------------------------------------------------
# CSRF token helper (needed for SPA to get the cookie on first load)
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([AllowAny])
def csrf_token(request):
    from django.middleware.csrf import get_token
    return Response({"csrfToken": get_token(request)})


# ---------------------------------------------------------------------------
# Notes CRUD
# ---------------------------------------------------------------------------

def _looks_like_html(content: str) -> bool:
    return bool(re.search(r"<\w+[^>]*>", (content or "").lstrip()[:64]))


def _strip_markdown_line(line: str) -> str:
    text = re.sub(r"^\s{0,3}#{1,6}\s+", "", line)
    text = re.sub(r"^\s{0,3}[-*+]\s+\[[ xX]\]\s+", "", text)
    text = re.sub(r"^\s{0,3}[-*+]\s+", "", text)
    text = re.sub(r"^\s{0,3}\d+\.\s+", "", text)
    text = re.sub(r"^\s{0,3}>\s?", "", text)
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"(\*\*|__|~~|`|\*|_)", "", text)
    return text.strip()


def _extract_markdown_lines(content: str) -> list[str]:
    return [line for line in (_strip_markdown_line(raw) for raw in content.splitlines()) if line]


def _extract_title(content: str) -> str:
    """Extract a markdown-aware display title from note content."""
    if not content:
        return "Untitled"
    if _looks_like_html(content):
        match = re.search(r"<div[^>]*>(.*?)</div>", content, re.DOTALL)
        if match:
            text = re.sub(r"<[^>]+>", "", match.group(1)).strip()
            return (text or "Untitled")[:500]
        text = re.sub(r"<[^>]+>", "", content).strip()
        return (text or "Untitled")[:500]
    lines = _extract_markdown_lines(content)
    return (lines[0] if lines else "Untitled")[:500]


def _extract_preview(content: str) -> str:
    """Extract markdown-aware preview text after the title line."""
    if not content:
        return ""
    if _looks_like_html(content):
        divs = re.findall(r"<div[^>]*>(.*?)</div>", content, re.DOTALL)
        if len(divs) > 1:
            lines = [re.sub(r"<[^>]+>", "", d).strip() for d in divs[1:]]
            return " ".join(l for l in lines if l)
        return ""
    lines = _extract_markdown_lines(content)
    return " ".join(lines[1:])


def _decode_legacy_bytes(value, field_name: str) -> bytes:
    """Decode legacy export byte fields from number arrays or base64 strings."""
    if isinstance(value, list):
        try:
            return bytes(value)
        except ValueError:
            raise ValueError(f"{field_name} must contain byte values from 0 to 255")
    if isinstance(value, str):
        try:
            return base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError(f"{field_name} must be valid base64")
    raise ValueError(f"{field_name} must be a byte array or base64 string")


def _legacy_key_params(data: dict) -> dict:
    key_params = data.get("keyParams") or data.get("key_params") or {}
    return key_params if isinstance(key_params, dict) else {}


def _legacy_iterations(data: dict) -> int:
    key_params = _legacy_key_params(data)
    iterations = key_params.get("iterations", data.get("iterations"))
    if iterations is None:
        raise ValueError("iterations is required")
    try:
        iterations = int(iterations)
    except (TypeError, ValueError):
        raise ValueError("iterations must be an integer")
    if iterations <= 0:
        raise ValueError("iterations must be positive")
    return iterations


def _legacy_salt(data: dict) -> bytes:
    key_params = _legacy_key_params(data)
    salt = key_params.get("salt", data.get("salt"))
    if salt is None:
        raise ValueError("salt is required")
    return _decode_legacy_bytes(salt, "salt")


def _legacy_note_ciphertext(data: dict) -> bytes:
    # Prefer the dedicated encryptedContent field (some older exports kept
    # plaintext content alongside the ciphertext). Fall back to content when
    # it's the ciphertext array.
    ciphertext = data.get("encryptedContent") or data.get("encrypted_content")
    if ciphertext is None and isinstance(data.get("content"), list):
        ciphertext = data.get("content")
    if ciphertext is None:
        raise ValueError("encrypted content is required")
    return _decode_legacy_bytes(ciphertext, "content")


def _legacy_iv(data: dict, field_name: str = "iv") -> bytes:
    iv = data.get("iv") or data.get("encIv") or data.get("enc_iv")
    if iv is None:
        raise ValueError(f"{field_name} is required")
    return _decode_legacy_bytes(iv, field_name)


def _legacy_visible_title(data: dict, fallback: str = "Untitled") -> str:
    for key in ("visibleTitle", "visible_title", "title"):
        value = data.get(key)
        if value is not None:
            return str(value).strip()[:500] or fallback
    return fallback


def _legacy_preview(data: dict):
    preview = data.get("previewContent", data.get("preview_content"))
    return preview if isinstance(preview, str) else None


def _is_legacy_encrypted_note(data: dict) -> bool:
    if data.get("type", "note") == Note.ITEM_TYPE_FOLDER:
        return False
    has_cipher = (
        isinstance(data.get("content"), list)
        or data.get("encryptedContent") is not None
        or data.get("encrypted_content") is not None
    )
    has_iv = data.get("iv") is not None or data.get("encIv") is not None or data.get("enc_iv") is not None
    has_salt = _legacy_key_params(data).get("salt", data.get("salt")) is not None
    if not (has_cipher and has_iv and has_salt):
        return False
    # Some older exports omitted the encrypted flag while still shipping the
    # ciphertext + iv + keyParams. Treat them as encrypted when locked.
    return data.get("encrypted") is True or data.get("locked") is True


def _is_legacy_locked_folder(data: dict) -> bool:
    verification = data.get("verificationData") or data.get("verification_data")
    return data.get("type") == Note.ITEM_TYPE_FOLDER and data.get("locked") is True and isinstance(verification, dict)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def notes_list(request):
    if request.method == "GET":
        notes = Note.objects.filter(user=request.user)
        return Response(NoteSerializer(notes, many=True).data)

    # POST — create note
    data = request.data.copy()
    note_id = data.get("id")
    if not note_id:
        return Response({"error": "id is required"}, status=status.HTTP_400_BAD_REQUEST)
    if Note.objects.filter(id=note_id, user=request.user).exists():
        return Response({"error": "Note already exists"}, status=status.HTTP_409_CONFLICT)

    content = data.get("content", "")
    note = Note.objects.create(
        id=note_id,
        user=request.user,
        content=content,
        date_modified=data.get("dateModified") or timezone.now(),
        pinned=data.get("pinned", False),
        locked=False,
        encrypted=False,
        item_type=data.get("type", "note"),
        parent_folder_id=data.get("parentFolderId"),
        visible_title=_extract_title(content) if content else "Untitled",
        preview_content=_extract_preview(content) if content else "",
        is_open=data.get("isOpen", False),
        caret_position=data.get("caretPosition"),
    )
    return Response(NoteSerializer(note).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def legacy_encrypted_import(request):
    """Import pre-server-encryption JSON items without decrypting ciphertext."""
    items = request.data if isinstance(request.data, list) else [request.data]
    imported = []

    for item in items:
        if not isinstance(item, dict):
            return Response({"error": "Each import item must be an object"}, status=status.HTTP_400_BAD_REQUEST)

        note_id = item.get("id")
        if not note_id:
            return Response({"error": "id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if Note.objects.filter(id=note_id, user=request.user).exists():
            return Response({"error": f"Note {note_id} already exists"}, status=status.HTTP_409_CONFLICT)

        try:
            if item.get("legacyBrokenLocked"):
                # Legacy export lost iv/salt/iterations; import as locked stub
                # with the ciphertext bytes preserved so the metadata survives.
                raw = item.get("content")
                if isinstance(raw, str):
                    try:
                        ciphertext = bytes(int(x) for x in raw.split(",") if x.strip())
                    except ValueError:
                        ciphertext = None
                else:
                    ciphertext = None
                note = Note.objects.create(
                    id=note_id,
                    user=request.user,
                    content=None,
                    encrypted_content=ciphertext,
                    enc_iv=None,
                    enc_salt=None,
                    enc_iterations=None,
                    date_modified=item.get("dateModified") or timezone.now(),
                    pinned=bool(item.get("pinned", False)),
                    locked=True,
                    encrypted=True,
                    item_type=Note.ITEM_TYPE_NOTE,
                    parent_folder_id=item.get("parentFolderId"),
                    visible_title=_legacy_visible_title(item),
                    preview_content=None,
                    caret_position=item.get("caretPosition"),
                )
            elif item.get("legacyEncryptedFolder"):
                # Legacy fully-encrypted folder. Server-side folder model uses
                # a verification blob; we cannot replay legacy folder crypto, so
                # import as a locked folder stub preserving its title.
                note = Note.objects.create(
                    id=note_id,
                    user=request.user,
                    content=_legacy_visible_title(item, "Untitled Folder"),
                    date_modified=item.get("dateModified") or timezone.now(),
                    pinned=bool(item.get("pinned", False)),
                    locked=True,
                    encrypted=False,
                    item_type=Note.ITEM_TYPE_FOLDER,
                    parent_folder_id=item.get("parentFolderId"),
                    visible_title=_legacy_visible_title(item, "Untitled Folder"),
                    preview_content=None,
                    is_open=False,
                )
            elif _is_legacy_encrypted_note(item):
                note = Note.objects.create(
                    id=note_id,
                    user=request.user,
                    content=None,
                    encrypted_content=_legacy_note_ciphertext(item),
                    enc_iv=_legacy_iv(item),
                    enc_salt=_legacy_salt(item),
                    enc_iterations=_legacy_iterations(item),
                    date_modified=item.get("dateModified") or timezone.now(),
                    pinned=bool(item.get("pinned", False)),
                    locked=True,
                    encrypted=True,
                    item_type=Note.ITEM_TYPE_NOTE,
                    parent_folder_id=item.get("parentFolderId"),
                    visible_title=_legacy_visible_title(item),
                    preview_content=_legacy_preview(item),
                    caret_position=item.get("caretPosition"),
                )
            elif _is_legacy_locked_folder(item):
                verification = item.get("verificationData") or item.get("verification_data")
                title_source = item.get("content") or item.get("title") or "Untitled Folder"
                title = _legacy_visible_title(
                    item,
                    _extract_title(str(title_source)),
                )
                note = Note.objects.create(
                    id=note_id,
                    user=request.user,
                    content=title,
                    ver_ciphertext=_decode_legacy_bytes(
                        verification.get("encryptedContent", verification.get("encrypted_content")),
                        "verificationData.encryptedContent",
                    ),
                    ver_iv=_legacy_iv(verification, "verificationData.iv"),
                    ver_salt=_legacy_salt(verification),
                    ver_iterations=_legacy_iterations(verification),
                    date_modified=item.get("dateModified") or timezone.now(),
                    pinned=bool(item.get("pinned", False)),
                    locked=True,
                    encrypted=False,
                    item_type=Note.ITEM_TYPE_FOLDER,
                    parent_folder_id=item.get("parentFolderId"),
                    visible_title=title,
                    preview_content=None,
                    is_open=False,
                )
            else:
                return Response(
                    {"error": "Item is not a supported legacy encrypted note or locked folder"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        imported.append(NoteSerializer(note).data)

    data = imported if isinstance(request.data, list) else imported[0]
    return Response(data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def note_detail(request, note_id):
    try:
        note = Note.objects.get(id=note_id, user=request.user)
    except Note.DoesNotExist:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(NoteSerializer(note).data)

    if request.method == "DELETE":
        note.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PUT — update
    data = request.data
    content = data.get("content")
    password = data.get("password")

    if note.item_type == Note.ITEM_TYPE_FOLDER and content is not None:
        note.content = content
        note.visible_title = _extract_title(content)
        note.preview_content = _extract_preview(content)
    elif note.locked and content is not None and password:
        try:
            enc = encrypt_content(content, password)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        note.encrypted_content = enc["encrypted_content"]
        note.enc_iv = enc["iv"]
        note.enc_salt = enc["salt"]
        note.enc_iterations = enc["iterations"]
        note.content = None
        note.encrypted = True
        # Update visible title from the plaintext before encrypting
        note.visible_title = _extract_title(content)
        note.preview_content = _extract_preview(content)
    elif content is not None and not note.locked:
        note.content = content
        note.visible_title = _extract_title(content)
        note.preview_content = _extract_preview(content)

    # Apply non-content fields
    for field, model_field in [
        ("pinned", "pinned"),
        ("isOpen", "is_open"),
        ("caretPosition", "caret_position"),
        ("parentFolderId", "parent_folder_id"),
    ]:
        if field in data:
            setattr(note, model_field, data[field])

    if "dateModified" in data:
        note.date_modified = data["dateModified"]
    else:
        note.date_modified = timezone.now()

    note.save()
    return Response(NoteSerializer(note).data)


# ---------------------------------------------------------------------------
# Lock / Unlock
# ---------------------------------------------------------------------------

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def note_lock(request, note_id):
    """Encrypt note content with provided password."""
    try:
        note = Note.objects.get(id=note_id, user=request.user)
    except Note.DoesNotExist:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    password = request.data.get("password", "")
    confirm = request.data.get("confirmPassword", "")
    if not password:
        return Response({"error": "Password required"}, status=status.HTTP_400_BAD_REQUEST)
    if confirm and password != confirm:
        return Response({"error": "Passwords do not match"}, status=status.HTTP_400_BAD_REQUEST)

    if note.item_type == Note.ITEM_TYPE_FOLDER:
        # Folders: store encrypted verification blob only
        ver = encrypt_verification(password)
        note.ver_ciphertext = ver["encrypted_content"]
        note.ver_iv = ver["iv"]
        note.ver_salt = ver["salt"]
        note.ver_iterations = ver["iterations"]
        note.locked = True
        note.is_open = False
        note.date_modified = timezone.now()
        note.save()
        return Response(NoteSerializer(note).data)

    # Notes: encrypt content
    if not note.content:
        return Response({"error": "No content to encrypt"}, status=status.HTTP_400_BAD_REQUEST)

    visible_title = _extract_title(note.content)
    enc = encrypt_content(note.content, password)

    note.encrypted_content = enc["encrypted_content"]
    note.enc_iv = enc["iv"]
    note.enc_salt = enc["salt"]
    note.enc_iterations = enc["iterations"]
    note.content = None
    note.locked = True
    note.encrypted = True
    note.visible_title = visible_title
    note.preview_content = ""
    note.date_modified = timezone.now()
    note.save()
    return Response(NoteSerializer(note).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def note_unlock(request, note_id):
    """
    Decrypt note for the session — returns decrypted content but DB stays encrypted.
    For permanent unlock, use note_unlock_permanent.
    """
    try:
        note = Note.objects.get(id=note_id, user=request.user)
    except Note.DoesNotExist:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    password = request.data.get("password", "")
    if not password:
        return Response({"error": "Password required"}, status=status.HTTP_400_BAD_REQUEST)

    if note.item_type == Note.ITEM_TYPE_FOLDER:
        # Verify folder password
        ok = verify_password(password, {
            "encrypted_content": bytes(note.ver_ciphertext),
            "iv": bytes(note.ver_iv),
            "salt": bytes(note.ver_salt),
            "iterations": note.ver_iterations,
        })
        if not ok:
            return Response({"error": "Invalid password"}, status=status.HTTP_401_UNAUTHORIZED)
        # Return folder with isOpen=True (DB stays locked)
        data = NoteSerializer(note).data
        data["isOpen"] = True
        return Response({"success": True, "note": data})

    # Note: decrypt
    if not (note.enc_iv and note.enc_salt and note.enc_iterations and note.encrypted_content):
        return Response(
            {"error": "This note's encryption parameters were lost during a legacy export and cannot be decrypted."},
            status=status.HTTP_410_GONE,
        )
    try:
        plaintext = decrypt_content(
            bytes(note.encrypted_content),
            bytes(note.enc_iv),
            bytes(note.enc_salt),
            note.enc_iterations,
            password,
        )
    except ValueError:
        return Response({"error": "Invalid password"}, status=status.HTTP_401_UNAUTHORIZED)

    data = NoteSerializer(note).data
    data["content"] = plaintext
    data["encrypted"] = False
    return Response({"success": True, "note": data})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def note_unlock_permanent(request, note_id):
    """Decrypt note and store plaintext — permanently removes encryption."""
    try:
        note = Note.objects.get(id=note_id, user=request.user)
    except Note.DoesNotExist:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    password = request.data.get("password", "")
    if not password:
        return Response({"error": "Password required"}, status=status.HTTP_400_BAD_REQUEST)

    if note.item_type == Note.ITEM_TYPE_FOLDER:
        ok = verify_password(password, {
            "encrypted_content": bytes(note.ver_ciphertext),
            "iv": bytes(note.ver_iv),
            "salt": bytes(note.ver_salt),
            "iterations": note.ver_iterations,
        })
        if not ok:
            return Response({"error": "Invalid password"}, status=status.HTTP_401_UNAUTHORIZED)
        note.locked = False
        note.is_open = True
        note.ver_ciphertext = None
        note.ver_iv = None
        note.ver_salt = None
        note.date_modified = timezone.now()
        note.save()
        return Response(NoteSerializer(note).data)

    try:
        plaintext = decrypt_content(
            bytes(note.encrypted_content),
            bytes(note.enc_iv),
            bytes(note.enc_salt),
            note.enc_iterations,
            password,
        )
    except ValueError:
        return Response({"error": "Invalid password"}, status=status.HTTP_401_UNAUTHORIZED)

    note.content = plaintext
    note.visible_title = _extract_title(plaintext)
    note.preview_content = _extract_preview(plaintext)
    note.locked = False
    note.encrypted = False
    note.encrypted_content = None
    note.enc_iv = None
    note.enc_salt = None
    note.date_modified = timezone.now()
    note.save()
    return Response(NoteSerializer(note).data)


# ---------------------------------------------------------------------------
# GIF proxy (keeps the Giphy API key server-side)
# ---------------------------------------------------------------------------

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def gif_search(request):
    query = request.query_params.get("q", "")
    if not query:
        return Response({"data": []})
    try:
        resp = requests.get(
            "https://api.giphy.com/v1/gifs/search",
            params={
                "api_key": settings.GIPHY_API_KEY,
                "q": query,
                "limit": 20,
                "offset": 0,
                "rating": "g",
                "lang": "en",
                "bundle": "messaging_non_clips",
            },
            timeout=5,
        )
        resp.raise_for_status()
        return Response(resp.json())
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
