from django.db import models
from django.conf import settings
from django.contrib.auth.models import User


class Note(models.Model):
    id = models.BigIntegerField(primary_key=True)  # Use frontend-generated ID
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notes')
    content = models.TextField(null=True, blank=True)
    date_created = models.DateTimeField(auto_now_add=True)
    date_modified = models.DateTimeField(auto_now=True)
    locked = models.BooleanField(default=False)
    encrypted = models.BooleanField(default=False)
    folder_path = models.CharField(max_length=255, blank=True, default='')
    pinned = models.BooleanField(default=False)
    visible_title = models.CharField(max_length=255, blank=True, default='')
    tags = models.JSONField(default=list, blank=True)
    key_params = models.JSONField(null=True, blank=True)
    iv = models.JSONField(null=True, blank=True)
    type = models.CharField(max_length=50, default='note')  # 'note' or 'folder'
    parent_folder_id = models.BigIntegerField(null=True, blank=True)  # Reference to parent folder
    is_open = models.BooleanField(default=False)  # For folders
    
    class Meta:
        unique_together = ['id', 'user']
        
    def __str__(self):
        return f"{self.visible_title or 'Untitled'} ({self.id})"


class UserStorage(models.Model):
    """Storage quota information for each user"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='storage')
    total_bytes = models.BigIntegerField(default=104857600)  # 100MB default
    used_bytes = models.BigIntegerField(default=0)
    
    def __str__(self):
        return f"{self.user.username}'s storage ({self.used_bytes}/{self.total_bytes} bytes)" 