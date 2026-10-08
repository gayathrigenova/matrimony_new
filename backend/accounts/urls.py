from django.urls import path
from .views import LoginView, ChangePasswordView, UpdateAccountView
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("update-account/", UpdateAccountView.as_view(), name="update-account"),
]
