from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path("auth/login/", views.auth_login, name="auth-login"),
    path("auth/logout/", views.auth_logout, name="auth-logout"),
    path("auth/me/", views.auth_me, name="auth-me"),
    path("auth/change_password/", views.auth_change_password, name="auth-change-password"),
    path("auth/csrf/", views.csrf_token, name="csrf-token"),

    # Notes
    path("notes/", views.notes_list, name="notes-list"),
    path("notes/import_legacy_encrypted/", views.legacy_encrypted_import, name="legacy-encrypted-import"),
    path("notes/<int:note_id>/", views.note_detail, name="note-detail"),
    path("notes/<int:note_id>/lock/", views.note_lock, name="note-lock"),
    path("notes/<int:note_id>/unlock/", views.note_unlock, name="note-unlock"),
    path("notes/<int:note_id>/unlock_permanent/", views.note_unlock_permanent, name="note-unlock-permanent"),

    # GIF proxy
    path("gifs/search/", views.gif_search, name="gif-search"),
]
