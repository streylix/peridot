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

def _extract_title(content: str) -> str:
    """Extract first-line text from HTML div content."""
    if not content:
        return "Untitled"
    match = re.search(r"<div[^>]*>(.*?)</div>", content, re.DOTALL)
    if match:
        text = re.sub(r"<[^>]+>", "", match.group(1)).strip()
        return text or "Untitled"
    text = re.sub(r"<[^>]+>", "", content).strip()
    return text or "Untitled"


def _extract_preview(content: str) -> str:
    """Extract preview text (everything after the first div)."""
    if not content:
        return ""
    divs = re.findall(r"<div[^>]*>(.*?)</div>", content, re.DOTALL)
    if len(divs) > 1:
        lines = [re.sub(r"<[^>]+>", "", d).strip() for d in divs[1:]]
        return " ".join(l for l in lines if l)
    return ""


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

    # If note is locked and we got plaintext content + password → re-encrypt
    if note.locked and content is not None and password:
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
