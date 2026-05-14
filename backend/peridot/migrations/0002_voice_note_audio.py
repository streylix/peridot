import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("peridot", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="VoiceNoteAudio",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("audio", models.FileField(upload_to="voice_notes/%Y/%m/%d/")),
                ("content_type", models.CharField(default="audio/webm", max_length=100)),
                ("size", models.BigIntegerField(default=0)),
                ("duration", models.FloatField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="voice_note_audio",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
