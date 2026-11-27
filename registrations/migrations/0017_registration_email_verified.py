from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("registrations", "0016_registration_phone_verified"),
    ]

    operations = [
        migrations.AddField(
            model_name="registration",
            name="email_verified",
            field=models.BooleanField(default=False),
        ),
    ]
