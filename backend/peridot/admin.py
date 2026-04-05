from django.contrib import admin
from .models import Note

@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ["id", "visible_title", "item_type", "locked", "pinned", "user", "date_modified"]
    list_filter = ["item_type", "locked", "pinned"]
    search_fields = ["visible_title", "content"]
    readonly_fields = ["id"]
