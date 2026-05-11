import django.core.validators
from django.db import migrations, models


def populate_usernames(apps, schema_editor):
    AppUser = apps.get_model("users", "AppUser")
    used = set()
    for user in AppUser.objects.all():
        base = (user.email or "").split("@")[0] or "user"
        candidate = base
        i = 1
        while candidate in used or AppUser.objects.filter(username=candidate).exclude(pk=user.pk).exists():
            i += 1
            candidate = f"{base}{i}"
        used.add(candidate)
        user.username = candidate
        user.save(update_fields=["username"])


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="appuser",
            name="username",
            field=models.CharField(
                max_length=150,
                null=True,
                validators=[django.core.validators.RegexValidator(r"^[\w.@+-]+$")],
                verbose_name="username",
            ),
        ),
        migrations.AddField(
            model_name="appuser",
            name="must_change_password",
            field=models.BooleanField(default=False, verbose_name="must change password"),
        ),
        migrations.RunPython(populate_usernames, reverse_code=migrations.RunPython.noop),
        migrations.RemoveIndex(
            model_name="appuser",
            name="users_appus_email_f34bde_idx",
        ),
        migrations.RemoveField(
            model_name="appuser",
            name="email",
        ),
        migrations.AlterField(
            model_name="appuser",
            name="username",
            field=models.CharField(
                db_index=True,
                max_length=150,
                unique=True,
                validators=[django.core.validators.RegexValidator(r"^[\w.@+-]+$")],
                verbose_name="username",
            ),
        ),
        migrations.AddIndex(
            model_name="appuser",
            index=models.Index(fields=["username"], name="users_appus_usernam_idx"),
        ),
    ]
