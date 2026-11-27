from datetime import datetime

from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date

from memberships.models import RazorpayOrder
from memberships.views import PLAN_CONFIG, _plan_for_amount
from registrations.models import Registration


# ─────────────────────────────────────────────
# DATE HELPERS
# ─────────────────────────────────────────────

def _parse_date_param(value):
    """Return an aware datetime from a YYYY-MM-DD string, or None."""
    if not value:
        return None
    d = parse_date(str(value).strip())
    if d is None:
        return None
    return timezone.make_aware(datetime(d.year, d.month, d.day))


def _date_range(qs, field, from_param, to_param):
    start = _parse_date_param(from_param)
    end = _parse_date_param(to_param)
    if start:
        qs = qs.filter(**{f"{field}__gte": start})
    if end:
        # inclusive: end of the given day
        qs = qs.filter(**{f"{field}__date__lte": end.date()})
    return qs


# ─────────────────────────────────────────────
# REGISTRATION REPORT
# ─────────────────────────────────────────────

def registration_queryset(params):
    qs = Registration.objects.select_related("user").order_by("-created_at")
    return _date_range(qs, "created_at", params.get("reg_from"), params.get("reg_to"))


def registration_rows(params):
    rows = []
    for reg in registration_queryset(params):
        rows.append({
            "profile_id": reg.id,
            "matrimony_id": reg.matrimony_id or "",
            "full_name": reg.full_name,
            "phone": reg.phone or "",
            "email": reg.user.email,
            "gender": reg.gender,
            "registration_date": reg.created_at,
            "status": reg.status,
            "phone_verified": reg.phone_verified,
            "email_verified": reg.email_verified,
        })
    return rows


# ─────────────────────────────────────────────
# PAYMENT REPORT
# ─────────────────────────────────────────────

def _plan_label(amount):
    key, _ = _plan_for_amount(amount)
    return key.capitalize()


def payment_queryset(params):
    qs = (
        RazorpayOrder.objects
        .select_related("user")
        .filter(status=RazorpayOrder.Status.PAID)
        .order_by("-paid_at")
    )
    return _date_range(qs, "paid_at", params.get("pay_from"), params.get("pay_to"))


def payment_rows(params):
    rows = []
    for order in payment_queryset(params):
        reg = order.user.registrations.order_by("-created_at").first()
        rows.append({
            "profile_id": reg.id if reg else "",
            "matrimony_id": reg.matrimony_id if reg else "",
            "customer_name": reg.full_name if reg else order.user.get_full_name() or order.user.email,
            "plan": _plan_label(order.amount),
            "amount_rupees": order.amount / 100,
            "payment_status": order.status,
            "payment_date": order.paid_at,
            "payment_id": order.payment_id or "",
            "provider_order_id": order.provider_order_id,
        })
    return rows


# ─────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────

def summary_data(params):
    reg_qs = registration_queryset(params)
    pay_qs = payment_queryset(params)

    # Registration counts
    reg_agg = reg_qs.aggregate(
        total=Count("id"),
        mobile_verified=Count("id", filter=Q(phone_verified=True)),
        ev_count=Count("id", filter=Q(email_verified=True)),
        fully_verified=Count("id", filter=Q(phone_verified=True, email_verified=True)),
    )

    status_counts = {
        item["status"]: item["count"]
        for item in reg_qs.order_by().values("status").annotate(count=Count("id"))
    }

    # Payment counts
    total_payments = pay_qs.count()
    total_revenue_paise = pay_qs.aggregate(total=Sum("amount"))["total"] or 0

    plan_breakdown = {}
    for key, plan in PLAN_CONFIG.items():
        plan_qs = pay_qs.filter(amount=plan["amount"])
        plan_breakdown[key] = {
            "count": plan_qs.count(),
            "revenue_rupees": (plan_qs.aggregate(t=Sum("amount"))["t"] or 0) / 100,
        }

    return {
        "registrations": {
            "total": reg_agg["total"],
            "mobile_verified": reg_agg["mobile_verified"],
            "email_verified": reg_agg["ev_count"],
            "fully_verified": reg_agg["fully_verified"],
            "by_status": status_counts,
        },
        "payments": {
            "total_successful": total_payments,
            "total_revenue_rupees": total_revenue_paise / 100,
            "by_plan": plan_breakdown,
        },
    }


# ─────────────────────────────────────────────
# EXCEL EXPORT
# ─────────────────────────────────────────────

def build_excel(params):
    import io
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    wb = Workbook()

    # ── helpers ──────────────────────────────
    HEADER_FONT = Font(bold=True, color="FFFFFF")
    HEADER_FILL = PatternFill("solid", fgColor="00733C")
    CENTER = Alignment(horizontal="center")

    def _write_headers(ws, headers):
        ws.append(headers)
        for col_idx, _ in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.font = HEADER_FONT
            cell.fill = HEADER_FILL
            cell.alignment = CENTER

    def _autofit(ws):
        for col in ws.columns:
            max_len = max((len(str(c.value or "")) for c in col), default=10)
            ws.column_dimensions[get_column_letter(col[0].column)].width = min(max_len + 4, 50)

    def _fmt_dt(val):
        if val is None:
            return ""
        if hasattr(val, "strftime"):
            return val.strftime("%Y-%m-%d %H:%M")
        return str(val)

    # ── Sheet 1: Summary ─────────────────────
    ws_sum = wb.active
    ws_sum.title = "Summary"
    data = summary_data(params)

    _write_headers(ws_sum, ["Metric", "Value"])
    reg = data["registrations"]
    pay = data["payments"]

    summary_rows = [
        ("Total Registrations", reg["total"]),
        ("Mobile Verified", reg["mobile_verified"]),
        ("Email Verified", reg["email_verified"]),
        ("Fully Verified (Both)", reg["fully_verified"]),
    ]
    for status_key, count in sorted(reg["by_status"].items()):
        summary_rows.append((f"Status: {status_key}", count))

    summary_rows += [
        ("", ""),
        ("Successful Payments", pay["total_successful"]),
        ("Total Revenue (₹)", pay["total_revenue_rupees"]),
    ]
    for plan_key, plan_data in pay["by_plan"].items():
        summary_rows.append((f"{plan_key.capitalize()} Plan — Count", plan_data["count"]))
        summary_rows.append((f"{plan_key.capitalize()} Plan — Revenue (₹)", plan_data["revenue_rupees"]))

    for row in summary_rows:
        ws_sum.append(row)
    _autofit(ws_sum)

    # ── Sheet 2: Detailed Registrations ──────
    ws_reg = wb.create_sheet("Detailed Registrations")
    reg_headers = [
        "Profile ID", "Matrimony ID", "Full Name", "Phone", "Email",
        "Gender", "Registration Date", "Status",
        "Mobile Verified", "Email Verified",
    ]
    _write_headers(ws_reg, reg_headers)
    for row in registration_rows(params):
        ws_reg.append([
            row["profile_id"],
            row["matrimony_id"],
            row["full_name"],
            row["phone"],
            row["email"],
            row["gender"],
            _fmt_dt(row["registration_date"]),
            row["status"],
            row["phone_verified"],
            row["email_verified"],
        ])
    _autofit(ws_reg)

    # ── Sheet 3: Payment Details ──────────────
    ws_pay = wb.create_sheet("Payment Details")
    pay_headers = [
        "Profile ID", "Matrimony ID", "Customer Name", "Plan",
        "Amount (₹)", "Payment Status", "Payment Date",
        "Payment ID", "Order ID",
    ]
    _write_headers(ws_pay, pay_headers)
    for row in payment_rows(params):
        ws_pay.append([
            row["profile_id"],
            row["matrimony_id"],
            row["customer_name"],
            row["plan"],
            row["amount_rupees"],
            row["payment_status"],
            _fmt_dt(row["payment_date"]),
            row["payment_id"],
            row["provider_order_id"],
        ])
    _autofit(ws_pay)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
