from django.db import migrations, models


FAQS = [
    ("general", "What is KeralaKara Matrimony?", "KeralaKara Matrimony is an online matrimonial platform that helps individuals and families find suitable life partners based on their preferences, personal details, and family backgrounds."),
    ("general", "Who can register on KeralaKara Matrimony?", "Anyone who is looking for a suitable life partner can register on KeralaKara Matrimony. Parents and guardians can also help create profiles for their children with their consent."),
    ("account", "How do I create an account?", "Click on the Register button, enter your required personal details, provide your mobile number and email address, complete OTP verification for both, and submit your registration."),
    ("profile", "Why is my profile showing as Pending?", "Your profile is waiting for verification by our administration team. Once your details have been reviewed and approved, your profile will become active on the website."),
    ("profile", "Can I update my profile information?", "Yes. You can update your personal, educational, professional, and family details through the My Profile section. Updated information may require admin approval before publication."),
    ("search", "How can I find suitable profiles?", "Log in to your account and browse available profiles. You can search using the available filters and preferences to find suitable matches."),
    ("membership", "What is a premium membership?", "Premium membership allows members to access additional services, including contact details of suitable profiles using available contact credits. Membership benefits depend on the selected plan."),
    ("security", "How is my personal information protected?", "We respect your privacy and take appropriate measures to protect your personal information. Your details are handled according to our privacy policy."),
    ("support", "What should I do if I forget my password?", "Click Forgot Password on the login page, enter your registered email address, and follow the password reset instructions sent to your email."),
    ("support", "How can I contact the support team?", "You can contact our support team through the Contact Us page or the official email address provided on KeralaKara Matrimony. We are happy to assist you."),
]


def create_faqs(apps, schema_editor):
    FAQ = apps.get_model("adminpanel", "FAQ")
    FAQ.objects.bulk_create([
        FAQ(
            category=category,
            question=question,
            answer=answer,
            is_active=True,
            sort_order=index,
        )
        for index, (category, question, answer) in enumerate(FAQS, start=1)
    ])


class Migration(migrations.Migration):

    dependencies = [
        ("adminpanel", "0003_profilechange_pending_horoscope_delete_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="FAQ",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("category", models.CharField(choices=[("general", "General Questions"), ("account", "Registration & Account"), ("profile", "Profile Management"), ("search", "Profile Search & Enquiries"), ("membership", "Membership & Payment"), ("security", "Security & Privacy"), ("support", "Support")], max_length=20)),
                ("question", models.CharField(max_length=255)),
                ("answer", models.TextField()),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "FAQ",
                "verbose_name_plural": "FAQs",
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.RunPython(create_faqs, migrations.RunPython.noop),
    ]
