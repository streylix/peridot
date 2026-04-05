from django.db import models
from django.conf import settings


class Note(models.Model):
    ITEM_TYPE_NOTE = "note"
    ITEM_TYPE_FOLDER = "folder"
    ITEM_TYPE_CHOICES = [
        (ITEM_TYPE_NOTE, "Note"),
        (ITEM_TYPE_FOLDER, "Folder"),
    ]

    # Client-generated timestamp ID (Date.now()) preserved for frontend compatibility
    id = models.BigIntegerField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notes",
    )

    # Note content — null when the note is encrypted
    content = models.TextField(null=True, blank=True)

    # Encryption fields (populated when locked=True)
    encrypted_content = models.BinaryField(null=True, blank=True)
    enc_iv = models.BinaryField(null=True, blank=True)
    enc_salt = models.BinaryField(null=True, blank=True)
    enc_iterations = models.IntegerField(default=100_000)

    # Folder password-verification fields (populated when folder is locked)
    ver_iv = models.BinaryField(null=True, blank=True)
    ver_salt = models.BinaryField(null=True, blank=True)
    ver_ciphertext = models.BinaryField(null=True, blank=True)
    ver_iterations = models.IntegerField(default=100_000)

    # Metadata
    date_modified = models.DateTimeField()
    pinned = models.BooleanField(default=False)
    locked = models.BooleanField(default=False)
    encrypted = models.BooleanField(default=False)
    item_type = models.CharField(
        max_length=10,
        choices=ITEM_TYPE_CHOICES,
        default=ITEM_TYPE_NOTE,
    )
    parent_folder_id = models.BigIntegerField(null=True, blank=True, db_index=True)

    # Extracted/cached display fields
    visible_title = models.CharField(max_length=500, null=True, blank=True)
    preview_content = models.TextField(null=True, blank=True)

    # UI state
    is_open = models.BooleanField(default=False)
    caret_position = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-date_modified"]
        indexes = [
            models.Index(fields=["user", "item_type"]),
            models.Index(fields=["user", "parent_folder_id"]),
        ]

    def __str__(self):
        return self.visible_title or f"Note {self.id}"
