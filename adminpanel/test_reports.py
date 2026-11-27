from datetime import date, timedelta
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from memberships.models import RazorpayOrder
from memberships.views import GOLD_PLAN_AMOUNT, DIAMOND_PLAN_AMOUNT
from registrations.models import Registration

User = get_user_model()


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _make_user(email, role=User.Role.CLIENT):
    return User.objects.create_user(email=email, password="pass123", role=role)


def _make_reg(user, **kwargs):
    defaults = {
        "full_name": "Test User",
        "gender": "Male",
        "date_of_birth": date(1995, 1, 1),
    }
    defaults.update(kwargs)
    return Registration.objects.create(user=user, **defaults)


def _make_paid_order(user, amount=GOLD_PLAN_AMOUNT, days_ago=0):
    paid_at = timezone.now() - timedelta(days=days_ago)
    return RazorpayOrder.objects.create(
        user=user,
        provider_order_id=f"order_{user.pk}_{amount}_{days_ago}",
        payment_id=f"pay_{user.pk}_{amount}_{days_ago}",
        amount=amount,
        currency="INR",
        status=RazorpayOrder.Status.PAID,
        paid_at=paid_at,
    )


def _make_pending_order(user):
    return RazorpayOrder.objects.create(
        user=user,
        provider_order_id=f"order_pending_{user.pk}",
        amount=GOLD_PLAN_AMOUNT,
        currency="INR",
        status=RazorpayOrder.Status.PENDING,
    )


# ─────────────────────────────────────────────
# PERMISSION TESTS
# ─────────────────────────────────────────────

class ReportPermissionTests(TestCase):
    ENDPOINTS = [
        "/api/adminpanel/reports/summary/",
        "/api/adminpanel/reports/registrations/",
        "/api/adminpanel/reports/payments/",
        "/api/adminpanel/reports/export/",
    ]

    def setUp(self):
        self.client = APIClient()
        self.admin = _make_user("admin-perm@example.com", role=User.Role.ADMIN)
        self.regular = _make_user("client-perm@example.com", role=User.Role.CLIENT)

    def test_unauthenticated_requests_are_rejected(self):
        for url in self.ENDPOINTS:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 401, f"Expected 401 for {url}")

    def test_client_role_is_forbidden(self):
        self.client.force_authenticate(self.regular)
        for url in self.ENDPOINTS:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 403, f"Expected 403 for {url}")

    def test_admin_role_is_allowed(self):
        self.client.force_authenticate(self.admin)
        for url in self.ENDPOINTS:
            response = self.client.get(url)
            self.assertIn(response.status_code, [200, 204], f"Expected 200 for {url}")


# ─────────────────────────────────────────────
# SUMMARY TESTS
# ─────────────────────────────────────────────

class SummaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = _make_user("admin-sum@example.com", role=User.Role.ADMIN)
        self.client.force_authenticate(self.admin)

        u1 = _make_user("sum1@example.com")
        u2 = _make_user("sum2@example.com")
        u3 = _make_user("sum3@example.com")

        _make_reg(u1, phone_verified=True, email_verified=True,
                  status=Registration.Status.PUBLISHED)
        _make_reg(u2, phone="+910000000001", phone_verified=True, email_verified=False,
                  status=Registration.Status.PENDING)
        _make_reg(u3, phone="+910000000002", phone_verified=False, email_verified=False,
                  status=Registration.Status.PENDING)

        _make_paid_order(u1, GOLD_PLAN_AMOUNT)
        _make_paid_order(u2, DIAMOND_PLAN_AMOUNT)
        _make_pending_order(u3)  # must NOT appear in payment totals

    def test_summary_registration_counts(self):
        r = self.client.get("/api/adminpanel/reports/summary/")
        self.assertEqual(r.status_code, 200)
        reg = r.data["registrations"]
        self.assertEqual(reg["total"], 3)
        self.assertEqual(reg["mobile_verified"], 2)
        self.assertEqual(reg["email_verified"], 1)
        self.assertEqual(reg["fully_verified"], 1)

    def test_summary_status_breakdown(self):
        r = self.client.get("/api/adminpanel/reports/summary/")
        by_status = r.data["registrations"]["by_status"]
        self.assertEqual(by_status.get("PUBLISHED"), 1)
        self.assertEqual(by_status.get("PENDING"), 2)

    def test_summary_payment_totals(self):
        r = self.client.get("/api/adminpanel/reports/summary/")
        pay = r.data["payments"]
        self.assertEqual(pay["total_successful"], 2)
        expected_revenue = (GOLD_PLAN_AMOUNT + DIAMOND_PLAN_AMOUNT) / 100
        self.assertAlmostEqual(pay["total_revenue_rupees"], expected_revenue)

    def test_summary_plan_breakdown(self):
        r = self.client.get("/api/adminpanel/reports/summary/")
        by_plan = r.data["payments"]["by_plan"]
        self.assertEqual(by_plan["gold"]["count"], 1)
        self.assertAlmostEqual(by_plan["gold"]["revenue_rupees"], GOLD_PLAN_AMOUNT / 100)
        self.assertEqual(by_plan["diamond"]["count"], 1)
        self.assertAlmostEqual(by_plan["diamond"]["revenue_rupees"], DIAMOND_PLAN_AMOUNT / 100)

    def test_pending_orders_excluded_from_payment_summary(self):
        r = self.client.get("/api/adminpanel/reports/summary/")
        self.assertEqual(r.data["payments"]["total_successful"], 2)


# ─────────────────────────────────────────────
# REGISTRATION REPORT TESTS
# ─────────────────────────────────────────────

class RegistrationReportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = _make_user("admin-reg@example.com", role=User.Role.ADMIN)
        self.client.force_authenticate(self.admin)

        self.u1 = _make_user("reg1@example.com")
        self.u2 = _make_user("reg2@example.com")
        _make_reg(self.u1, full_name="Alice", phone_verified=True, email_verified=True)
        _make_reg(self.u2, full_name="Bob", phone_verified=False, email_verified=False)

    def test_returns_all_registrations(self):
        r = self.client.get("/api/adminpanel/reports/registrations/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)

    def test_row_contains_required_fields(self):
        r = self.client.get("/api/adminpanel/reports/registrations/")
        row = next(row for row in r.data if row["full_name"] == "Alice")
        for field in ("profile_id", "matrimony_id", "full_name", "phone", "email",
                      "gender", "registration_date", "status",
                      "phone_verified", "email_verified"):
            self.assertIn(field, row, f"Missing field: {field}")

    def test_email_comes_from_user_not_registration(self):
        r = self.client.get("/api/adminpanel/reports/registrations/")
        row = next(row for row in r.data if row["full_name"] == "Alice")
        self.assertEqual(row["email"], "reg1@example.com")

    def test_verification_flags_are_correct(self):
        r = self.client.get("/api/adminpanel/reports/registrations/")
        alice = next(row for row in r.data if row["full_name"] == "Alice")
        bob = next(row for row in r.data if row["full_name"] == "Bob")
        self.assertTrue(alice["phone_verified"])
        self.assertTrue(alice["email_verified"])
        self.assertFalse(bob["phone_verified"])
        self.assertFalse(bob["email_verified"])


# ─────────────────────────────────────────────
# PAYMENT REPORT TESTS
# ─────────────────────────────────────────────

class PaymentReportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = _make_user("admin-pay@example.com", role=User.Role.ADMIN)
        self.client.force_authenticate(self.admin)

        self.u1 = _make_user("pay1@example.com")
        self.u2 = _make_user("pay2@example.com")
        self.u3 = _make_user("pay3@example.com")

        _make_reg(self.u1, full_name="Gold User")
        _make_reg(self.u2, full_name="Diamond User")

        _make_paid_order(self.u1, GOLD_PLAN_AMOUNT)
        _make_paid_order(self.u2, DIAMOND_PLAN_AMOUNT)
        _make_pending_order(self.u3)

    def test_only_paid_orders_are_returned(self):
        r = self.client.get("/api/adminpanel/reports/payments/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)

    def test_row_contains_required_fields(self):
        r = self.client.get("/api/adminpanel/reports/payments/")
        row = r.data[0]
        for field in ("profile_id", "matrimony_id", "customer_name", "plan",
                      "amount_rupees", "payment_status", "payment_date",
                      "payment_id", "provider_order_id"):
            self.assertIn(field, row, f"Missing field: {field}")

    def test_plan_labels_are_correct(self):
        r = self.client.get("/api/adminpanel/reports/payments/")
        plans = {row["customer_name"]: row["plan"] for row in r.data}
        self.assertEqual(plans["Gold User"], "Gold")
        self.assertEqual(plans["Diamond User"], "Diamond")

    def test_amount_is_in_rupees(self):
        r = self.client.get("/api/adminpanel/reports/payments/")
        gold_row = next(row for row in r.data if row["plan"] == "Gold")
        self.assertAlmostEqual(gold_row["amount_rupees"], GOLD_PLAN_AMOUNT / 100)

    def test_pending_orders_are_excluded(self):
        r = self.client.get("/api/adminpanel/reports/payments/")
        statuses = [row["payment_status"] for row in r.data]
        self.assertNotIn("PENDING", statuses)


# ─────────────────────────────────────────────
# DATE FILTER TESTS
# ─────────────────────────────────────────────

class DateFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = _make_user("admin-date@example.com", role=User.Role.ADMIN)
        self.client.force_authenticate(self.admin)

        self.u1 = _make_user("date1@example.com")
        self.u2 = _make_user("date2@example.com")
        self.u3 = _make_user("date3@example.com")

        self.reg1 = _make_reg(self.u1, full_name="Early")
        self.reg2 = _make_reg(self.u2, full_name="Late")
        self.reg3 = _make_reg(self.u3, full_name="Middle")

        # Backdate reg1 to 10 days ago, reg3 to 5 days ago, reg2 stays now
        Registration.objects.filter(pk=self.reg1.pk).update(
            created_at=timezone.now() - timedelta(days=10)
        )
        Registration.objects.filter(pk=self.reg3.pk).update(
            created_at=timezone.now() - timedelta(days=5)
        )

        # Payments: u1 paid 10 days ago, u2 paid today
        self.order1 = _make_paid_order(self.u1, GOLD_PLAN_AMOUNT, days_ago=10)
        self.order2 = _make_paid_order(self.u2, DIAMOND_PLAN_AMOUNT, days_ago=0)

    def _today(self):
        return timezone.now().date().isoformat()

    def _days_ago(self, n):
        return (timezone.now().date() - timedelta(days=n)).isoformat()

    def test_reg_from_filter_excludes_earlier_records(self):
        r = self.client.get("/api/adminpanel/reports/registrations/",
                            {"reg_from": self._days_ago(7)})
        names = [row["full_name"] for row in r.data]
        self.assertIn("Late", names)
        self.assertIn("Middle", names)
        self.assertNotIn("Early", names)

    def test_reg_to_filter_excludes_later_records(self):
        r = self.client.get("/api/adminpanel/reports/registrations/",
                            {"reg_to": self._days_ago(7)})
        names = [row["full_name"] for row in r.data]
        self.assertIn("Early", names)
        self.assertNotIn("Late", names)

    def test_reg_from_and_to_together(self):
        r = self.client.get("/api/adminpanel/reports/registrations/", {
            "reg_from": self._days_ago(7),
            "reg_to": self._days_ago(3),
        })
        names = [row["full_name"] for row in r.data]
        self.assertIn("Middle", names)
        self.assertNotIn("Early", names)
        self.assertNotIn("Late", names)

    def test_pay_from_filter(self):
        r = self.client.get("/api/adminpanel/reports/payments/",
                            {"pay_from": self._days_ago(3)})
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]["plan"], "Diamond")

    def test_pay_to_filter(self):
        r = self.client.get("/api/adminpanel/reports/payments/",
                            {"pay_to": self._days_ago(7)})
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]["plan"], "Gold")

    def test_reg_and_pay_filters_are_independent(self):
        # Filter registrations to last 3 days, payments to last 15 days
        r = self.client.get("/api/adminpanel/reports/summary/", {
            "reg_from": self._days_ago(3),
            "pay_from": self._days_ago(15),
        })
        self.assertEqual(r.data["registrations"]["total"], 1)   # only "Late"
        self.assertEqual(r.data["payments"]["total_successful"], 2)  # both orders

    def test_summary_date_filters_apply_to_both_sections(self):
        r = self.client.get("/api/adminpanel/reports/summary/", {
            "reg_from": self._days_ago(3),
            "pay_from": self._days_ago(3),
        })
        self.assertEqual(r.data["registrations"]["total"], 1)
        self.assertEqual(r.data["payments"]["total_successful"], 1)

    def test_invalid_date_param_is_ignored(self):
        r = self.client.get("/api/adminpanel/reports/registrations/",
                            {"reg_from": "not-a-date"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 3)  # all records returned


# ─────────────────────────────────────────────
# PENDING PAYMENT NULL paid_at TESTS
# ─────────────────────────────────────────────

class PendingPaymentNullPaidAtTests(TestCase):
    """Pending orders have paid_at=None and must never appear in reports."""

    def setUp(self):
        self.client = APIClient()
        self.admin = _make_user("admin-null@example.com", role=User.Role.ADMIN)
        self.client.force_authenticate(self.admin)
        self.u = _make_user("null-pay@example.com")
        _make_reg(self.u)
        _make_pending_order(self.u)

    def test_pending_order_excluded_from_payment_list(self):
        r = self.client.get("/api/adminpanel/reports/payments/")
        self.assertEqual(len(r.data), 0)

    def test_pending_order_excluded_from_summary(self):
        r = self.client.get("/api/adminpanel/reports/summary/")
        self.assertEqual(r.data["payments"]["total_successful"], 0)
        self.assertAlmostEqual(r.data["payments"]["total_revenue_rupees"], 0)

    def test_pay_date_filter_does_not_crash_on_null_paid_at(self):
        r = self.client.get("/api/adminpanel/reports/payments/",
                            {"pay_from": "2020-01-01"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 0)


# ─────────────────────────────────────────────
# EXCEL EXPORT TESTS
# ─────────────────────────────────────────────

class ExcelExportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = _make_user("admin-xl@example.com", role=User.Role.ADMIN)
        self.client.force_authenticate(self.admin)

        u1 = _make_user("xl1@example.com")
        u2 = _make_user("xl2@example.com")
        _make_reg(u1, full_name="Excel Alice", phone_verified=True, email_verified=True)
        _make_reg(u2, full_name="Excel Bob")
        _make_paid_order(u1, GOLD_PLAN_AMOUNT)
        _make_paid_order(u2, DIAMOND_PLAN_AMOUNT)

    def test_export_returns_xlsx_content_type(self):
        r = self.client.get("/api/adminpanel/reports/export/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            r["Content-Type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    def test_export_has_content_disposition_attachment(self):
        r = self.client.get("/api/adminpanel/reports/export/")
        self.assertIn("attachment", r["Content-Disposition"])
        self.assertIn(".xlsx", r["Content-Disposition"])

    def test_export_is_valid_xlsx_with_three_sheets(self):
        from openpyxl import load_workbook
        r = self.client.get("/api/adminpanel/reports/export/")
        wb = load_workbook(BytesIO(r.content))
        self.assertEqual(len(wb.sheetnames), 3)
        self.assertIn("Summary", wb.sheetnames)
        self.assertIn("Detailed Registrations", wb.sheetnames)
        self.assertIn("Payment Details", wb.sheetnames)

    def test_registration_sheet_contains_all_records(self):
        from openpyxl import load_workbook
        r = self.client.get("/api/adminpanel/reports/export/")
        wb = load_workbook(BytesIO(r.content))
        ws = wb["Detailed Registrations"]
        # row 1 = headers; rows 2+ = data
        names = [ws.cell(row=i, column=3).value for i in range(2, ws.max_row + 1)]
        self.assertIn("Excel Alice", names)
        self.assertIn("Excel Bob", names)

    def test_payment_sheet_contains_all_paid_records(self):
        from openpyxl import load_workbook
        r = self.client.get("/api/adminpanel/reports/export/")
        wb = load_workbook(BytesIO(r.content))
        ws = wb["Payment Details"]
        plans = [ws.cell(row=i, column=4).value for i in range(2, ws.max_row + 1)]
        self.assertIn("Gold", plans)
        self.assertIn("Diamond", plans)

    def test_export_respects_date_filters(self):
        from openpyxl import load_workbook
        # Filter to a date range that excludes everything
        r = self.client.get("/api/adminpanel/reports/export/",
                            {"reg_from": "2000-01-01", "reg_to": "2000-01-02"})
        self.assertEqual(r.status_code, 200)
        wb = load_workbook(BytesIO(r.content))
        ws = wb["Detailed Registrations"]
        # Only header row should exist
        self.assertEqual(ws.max_row, 1)

    def test_no_passwords_or_sensitive_data_in_export(self):
        r = self.client.get("/api/adminpanel/reports/export/")
        # Ensure raw bytes don't contain password-like strings
        content = r.content
        self.assertNotIn(b"password", content.lower())
        self.assertNotIn(b"otp", content.lower())
        self.assertNotIn(b"secret", content.lower())
