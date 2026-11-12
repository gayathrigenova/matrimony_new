from django.urls import path

from .views import (
    AdminFAQDetailView,
    AdminFAQListCreateView,
    AdminFAQReorderView,
    AdminRegistrationListView,
    AdminRegistrationDetailView,
    AdminApproveRegistrationView,
    AdminCorrectionRegistrationView,
    AdminRejectRegistrationView,
    AdminPublishRegistrationView,
    PublicFAQListView,
)


urlpatterns = [
    path("faqs/", PublicFAQListView.as_view(), name="public-faq-list"),
    path("faqs/manage/", AdminFAQListCreateView.as_view(), name="admin-faq-list"),
    path("faqs/manage/reorder/", AdminFAQReorderView.as_view(), name="admin-faq-reorder"),
    path("faqs/manage/<int:pk>/", AdminFAQDetailView.as_view(), name="admin-faq-detail"),
    path(
        "registrations/",
        AdminRegistrationListView.as_view(),
        name="admin-registration-list",
    ),

    path(
        "registrations/<int:pk>/",
        AdminRegistrationDetailView.as_view(),
        name="admin-registration-detail",
    ),

    path(
        "registrations/<int:pk>/approve/",
        AdminApproveRegistrationView.as_view(),
        name="admin-registration-approve",
    ),

    path(
        "registrations/<int:pk>/correction/",
        AdminCorrectionRegistrationView.as_view(),
        name="admin-registration-correction",
    ),

    path(
        "registrations/<int:pk>/reject/",
        AdminRejectRegistrationView.as_view(),
        name="admin-registration-reject",
    ),

    path(
        "registrations/<int:pk>/publish/",
        AdminPublishRegistrationView.as_view(),
        name="admin-registration-publish",
    ),
]