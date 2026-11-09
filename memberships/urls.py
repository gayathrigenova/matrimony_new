from django.urls import path

from .views import (
    ContactCreditBalanceView,
    ContactUnlockView,
    RazorpayOrderCreateView,
    RazorpayPaymentVerifyView,
    RazorpayWebhookView,
)


urlpatterns = [
    path("contact-credits/", ContactCreditBalanceView.as_view(), name="contact-credit-balance"),
    path("contacts/<int:profile_id>/unlock/", ContactUnlockView.as_view(), name="contact-unlock"),
    path("razorpay/orders/", RazorpayOrderCreateView.as_view(), name="razorpay-order-create"),
    path("razorpay/verify/", RazorpayPaymentVerifyView.as_view(), name="razorpay-payment-verify"),
    path("razorpay/webhook/", RazorpayWebhookView.as_view(), name="razorpay-webhook"),
]
