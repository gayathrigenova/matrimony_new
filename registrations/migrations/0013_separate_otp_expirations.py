from django.db import migrations, models
from django.db.models import F


def copy_existing_expirations(apps, schema_editor):
    verification_challenge = apps.get_model(
        "registrations",
        "VerificationChallenge",
    )
    verification_challenge.objects.using(schema_editor.connection.alias).update(
        email_expires_at=F("expires_at"),
        phone_expires_at=F("expires_at"),
    )


class Migration(migrations.Migration):

    dependencies = [
        ("registrations", "0012_alter_registration_caste"),
    ]

    operations = [
        migrations.AddField(
            model_name="verificationchallenge",
            name="email_expires_at",
            field=models.DateTimeField(null=True),
        ),
        migrations.AddField(
            model_name="verificationchallenge",
            name="phone_expires_at",
            field=models.DateTimeField(null=True),
        ),
        migrations.RunPython(
            copy_existing_expirations,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="verificationchallenge",
            name="email_expires_at",
            field=models.DateTimeField(),
        ),
        migrations.AlterField(
            model_name="verificationchallenge",
            name="phone_expires_at",
            field=models.DateTimeField(),
        ),
    ]
