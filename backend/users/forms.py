from django import forms
from django.contrib.auth.forms import UserCreationForm
from .models import AppUser


class AppUserCreationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = AppUser
        fields = ("username",)
