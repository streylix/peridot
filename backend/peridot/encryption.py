"""
Server-side AES-256-GCM encryption using PBKDF2-SHA256 key derivation.
Replaces the client-side Web Crypto API usage in the original frontend.
"""
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

DEFAULT_ITERATIONS = 100_000
VERIFICATION_STRING = "VALID_PASSWORD_VERIFICATION"


def derive_key(password: str, salt: bytes, iterations: int = DEFAULT_ITERATIONS) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
    )
    return kdf.derive(password.encode("utf-8"))


def encrypt_content(content: str, password: str) -> dict:
    """Encrypt a plaintext string. Returns dict with binary fields for DB storage."""
    salt = os.urandom(16)
    iv = os.urandom(12)
    key = derive_key(password, salt)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, content.encode("utf-8"), None)
    return {
        "encrypted_content": ciphertext,
        "iv": iv,
        "salt": salt,
        "iterations": DEFAULT_ITERATIONS,
    }


def decrypt_content(
    encrypted_content: bytes,
    iv: bytes,
    salt: bytes,
    iterations: int,
    password: str,
) -> str:
    """Decrypt ciphertext. Raises ValueError on wrong password."""
    key = derive_key(password, salt, iterations)
    aesgcm = AESGCM(key)
    try:
        plaintext = aesgcm.decrypt(iv, encrypted_content, None)
    except Exception:
        raise ValueError("Invalid password or corrupted data")
    return plaintext.decode("utf-8")


def encrypt_verification(password: str) -> dict:
    """Encrypt the verification string for folder lock."""
    return encrypt_content(VERIFICATION_STRING, password)


def verify_password(password: str, verification: dict) -> bool:
    """Check if a password is correct by decrypting the verification blob."""
    try:
        result = decrypt_content(
            bytes(verification["encrypted_content"]),
            bytes(verification["iv"]),
            bytes(verification["salt"]),
            verification["iterations"],
            password,
        )
        return result == VERIFICATION_STRING
    except Exception:
        return False
