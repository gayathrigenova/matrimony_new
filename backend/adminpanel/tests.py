from django.test import TestCase

from datetime import date

from rest_framework.test import APIClient

from accounts.models import User
from adminpanel.models import ProfileChange, ProfileVerification
from registrations.models import Registration


class AdminRegistrationDeletionTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            email="client@example.com",
            password="test-password",
        )
        self.admin_user = User.objects.create_user(
            email="admin@example.com",
            password="test-password",
            role=User.Role.ADMIN,
        )
        self.registration = Registration.objects.create(
            user=self.client_user,
            full_name="Client User",
            gender="Female",
            date_of_birth=date(1998, 1, 1),
        )
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.client_user)
        self.admin_api = APIClient()
        self.admin_api.force_authenticate(self.admin_user)

    def test_admin_can_delete_profile_and_related_records(self):
        ProfileVerification.objects.create(client=self.client_user)
        ProfileChange.objects.create(
            registration=self.registration,
            user=self.client_user,
        )

        response = self.admin_api.delete(
            f"/api/adminpanel/registrations/{self.registration.pk}/"
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(
            Registration.objects.filter(pk=self.registration.pk).exists()
        )
        self.assertFalse(
            ProfileVerification.objects.filter(client=self.client_user).exists()
        )
        self.assertFalse(
            ProfileChange.objects.filter(user=self.client_user).exists()
        )
        self.assertFalse(User.objects.filter(pk=self.client_user.pk).exists())

    def test_client_cannot_delete_profile(self):
        response = self.client_api.delete(
            f"/api/adminpanel/registrations/{self.registration.pk}/"
        )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(
            Registration.objects.filter(pk=self.registration.pk).exists()
        )

    def test_deleting_profile_keeps_account_with_another_profile(self):
        other_registration = Registration.objects.create(
            user=self.client_user,
            full_name="Another Profile",
            gender="Female",
            date_of_birth=date(1997, 1, 1),
        )

        response = self.admin_api.delete(
            f"/api/adminpanel/registrations/{self.registration.pk}/"
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(
            Registration.objects.filter(pk=self.registration.pk).exists()
        )
        self.assertTrue(
            Registration.objects.filter(pk=other_registration.pk).exists()
        )
        self.assertTrue(User.objects.filter(pk=self.client_user.pk).exists())
