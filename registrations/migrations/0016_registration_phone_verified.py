from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("registrations", "0015_clientphoto_pending_delete"),
    ]

    operations = [
        migrations.AddField(
            model_name="registration",
            name="phone_verified",
            field=models.BooleanField(default=False),
        ),
    ]
