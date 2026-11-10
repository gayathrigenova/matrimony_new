from django.urls import path
from .views import (
    LoginView,
    ChangePasswordView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    UpdateAccountView,
)
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="password-reset"),
    path(
        "password-reset-confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("update-account/", UpdateAccountView.as_view(), name="update-account"),
]