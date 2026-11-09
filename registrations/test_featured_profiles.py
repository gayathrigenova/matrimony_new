from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from registrations.models import Registration


class FeaturedProfileListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(
            email="featured@example.com",
            password="test-password",
            full_name="Featured Member",
        )
        self.profile = Registration.objects.create(
            user=user,
            full_name="Featured Member",
            gender="Female",
            date_of_birth=date(1998, 1, 1),
            occupation="Software Developer",
            caste="Thiyya",
            district="Kollam",
            state="Kerala",
            phone="9999999999",
            status=Registration.Status.PUBLISHED,
        )

    def test_anonymous_visitor_gets_only_featured_profile_fields(self):
        response = self.client.get("/api/registrations/featured/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        profile = response.data[0]
        self.assertEqual(profile["id"], self.profile.pk)
        self.assertEqual(profile["full_name"], "Featured Member")
        self.assertEqual(profile["occupation"], "Software Developer")
        self.assertEqual(profile["caste"], "Thiyya")
        self.assertEqual(profile["district"], "Kollam")
        self.assertEqual(profile["state"], "Kerala")
        self.assertNotIn("phone", profile)
        self.assertNotIn("email", profile)
        self.assertNotIn("birth_star", profile)
        self.assertIn("profile_photo_url", profile)

    def test_unpublished_profiles_are_not_featured(self):
        self.profile.status = Registration.Status.APPROVED
        self.profile.save(update_fields=["status"])

        response = self.client.get("/api/registrations/featured/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_full_profile_details_still_require_authentication(self):
        response = self.client.get(
            f"/api/registrations/published/{self.profile.pk}/"
        )

        self.assertEqual(response.status_code, 401)
