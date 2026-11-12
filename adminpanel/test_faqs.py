from collections import Counter

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from adminpanel.models import FAQ


class FAQAPITests(TestCase):
    def setUp(self):
        FAQ.objects.all().delete()
        self.admin = User.objects.create_user(
            email="faq-admin@example.com",
            password="good-password",
            role=User.Role.ADMIN,
        )
        self.client_user = User.objects.create_user(
            email="faq-client@example.com",
            password="good-password",
            role=User.Role.CLIENT,
        )
        self.admin_api = APIClient()
        self.admin_api.force_authenticate(self.admin)
        self.client_api = APIClient()
        self.client_api.force_authenticate(self.client_user)
        self.public_faq = FAQ.objects.create(
            category=FAQ.Category.GENERAL,
            question="Visible question?",
            answer="Visible answer.",
            sort_order=1,
        )
        self.hidden_faq = FAQ.objects.create(
            category=FAQ.Category.SUPPORT,
            question="Hidden question?",
            answer="Hidden answer.",
            is_active=False,
            sort_order=2,
        )

    def test_public_endpoint_returns_only_active_faqs_in_order(self):
        response = APIClient().get("/api/adminpanel/faqs/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([faq["id"] for faq in response.data], [self.public_faq.id])

    def test_admin_can_create_update_deactivate_and_delete_faqs(self):
        create = self.admin_api.post(
            "/api/adminpanel/faqs/manage/",
            {
                "category": FAQ.Category.ACCOUNT,
                "question": "New question?",
                "answer": "New answer.",
                "is_active": True,
                "sort_order": 3,
            },
            format="json",
        )
        self.assertEqual(create.status_code, 201, create.data)
        faq_id = create.data["id"]

        update = self.admin_api.patch(
            f"/api/adminpanel/faqs/manage/{faq_id}/",
            {"is_active": False, "sort_order": 1},
            format="json",
        )
        self.assertEqual(update.status_code, 200, update.data)
        self.assertFalse(update.data["is_active"])

        self.assertEqual(
            self.admin_api.delete(f"/api/adminpanel/faqs/manage/{faq_id}/").status_code,
            204,
        )
        self.assertFalse(FAQ.objects.filter(id=faq_id).exists())

    def test_faq_management_requires_admin_role(self):
        response = self.client_api.get("/api/adminpanel/faqs/manage/")

        self.assertEqual(response.status_code, 403)

    def test_reorder_updates_public_faq_order_and_rejects_incomplete_lists(self):
        reordered_ids = [self.hidden_faq.id, self.public_faq.id]
        invalid = self.admin_api.post(
            "/api/adminpanel/faqs/manage/reorder/",
            {"faq_ids": [self.public_faq.id]},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)

        response = self.admin_api.post(
            "/api/adminpanel/faqs/manage/reorder/",
            {"faq_ids": reordered_ids},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([faq["id"] for faq in response.data], reordered_ids)
        self.assertEqual(
            list(FAQ.objects.values_list("id", flat=True)),
            reordered_ids,
        )


class FAQSeedDataTests(TestCase):
    def test_seed_includes_all_10_active_faqs_in_every_category(self):
        self.assertEqual(FAQ.objects.filter(is_active=True).count(), 10)
        self.assertEqual(
            Counter(FAQ.objects.values_list("category", flat=True)),
            {
                FAQ.Category.GENERAL: 2,
                FAQ.Category.ACCOUNT: 1,
                FAQ.Category.PROFILE: 2,
                FAQ.Category.SEARCH: 1,
                FAQ.Category.MEMBERSHIP: 1,
                FAQ.Category.SECURITY: 1,
                FAQ.Category.SUPPORT: 2,
            },
        )
        response = APIClient().get("/api/adminpanel/faqs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 10)
        self.assertTrue(all(faq["is_active"] for faq in response.data))
