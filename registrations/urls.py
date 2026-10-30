from django.urls import path

from .views import (
    RegistrationCreateView,
    RegistrationAvailabilityView,
    VerificationStartView,
    VerificationCodeView,
    VerificationResendView,
    PublishedRegistrationListView,
    PublishedRegistrationDetailView,
    PendingRegistrationListView,
    RegistrationDetailView,
    RegistrationApproveView,
    RegistrationRejectView,
    RegistrationCorrectionView,
    RegistrationPublishView,
    MyProfileView,
    MyHoroscopeFileView,
    ProfileViewCreateView,
    SendInterestView,
    UpdateInterestView,
    ReceivedInterestsListView,
    SentInterestsListView,
    ShortlistProfileView,
    RemoveShortlistView,
    ShortlistListView,
    ClientPhotoListView,
    ClientPhotoUploadView,
    ClientPhotoActionView,
    PendingFileView,
    ConversationListView,
    ConversationDetailView,
    SendMessageView,
    StartConversationView,
)


urlpatterns = [

    path("availability/", RegistrationAvailabilityView.as_view(), name="registration-availability"),
    path("verification/start/", VerificationStartView.as_view(), name="verification-start"),
    path("verification/verify/", VerificationCodeView.as_view(), name="verification-verify"),
    path("verification/resend/", VerificationResendView.as_view(), name="verification-resend"),

    # =========================================================
    # USER REGISTRATION
    # =========================================================

    path(
        "",
        RegistrationCreateView.as_view(),
        name="registration-create"
    ),


    # =========================================================
    # PUBLIC - PUBLISHED PROFILES
    # =========================================================

    path(
        "published/",
        PublishedRegistrationListView.as_view(),
        name="published-registrations"
    ),

    path(
        "published/<int:pk>/",
        PublishedRegistrationDetailView.as_view(),
        name="published-registration-detail"
    ),


    # =========================================================
    # CLIENT - MY PROFILE
    # =========================================================

    path(
        "my-profile/",
        MyProfileView.as_view(),
        name="my-profile"
    ),
    path(
        "my-profile/horoscope/",
        MyHoroscopeFileView.as_view(),
        name="my-horoscope-file",
    ),


    # =========================================================
    # CLIENT - PROFILE VIEW
    # =========================================================

    path(
        "<int:pk>/view/",
        ProfileViewCreateView.as_view(),
        name="profile-view-record"
    ),


    # =========================================================
    # CLIENT - INTERESTS
    # =========================================================

    # Send interest
    path(
        "<int:pk>/interest/",
        SendInterestView.as_view(),
        name="send-interest"
    ),

    # Update interest - accept / decline
    path(
        "interest/<int:pk>/update/",
        UpdateInterestView.as_view(),
        name="update-interest"
    ),

    # Received interests
    path(
        "interests/received/",
        ReceivedInterestsListView.as_view(),
        name="interests-received"
    ),

    # Sent interests
    path(
        "interests/sent/",
        SentInterestsListView.as_view(),
        name="interests-sent"
    ),


    # =========================================================
    # CLIENT - SHORTLIST
    # =========================================================

    # List shortlisted profiles
    path(
        "shortlist/",
        ShortlistListView.as_view(),
        name="shortlist-list"
    ),

    # Add profile to shortlist
    path(
        "<int:pk>/shortlist/",
        ShortlistProfileView.as_view(),
        name="shortlist-add"
    ),

    # Remove profile from shortlist
    path(
        "<int:pk>/shortlist/remove/",
        RemoveShortlistView.as_view(),
        name="shortlist-remove"
    ),


    # =========================================================
    # CLIENT - PHOTOS
    # =========================================================

    # Get all 4 photo slots
    path(
        "photos/",
        ClientPhotoListView.as_view(),
        name="client-photos-list"
    ),

    # Upload photo
    path(
        "photos/upload/",
        ClientPhotoUploadView.as_view(),
        name="client-photo-upload"
    ),

    # Set main / delete photo
    path(
        "photos/<int:slot_index>/<str:action>/",
        ClientPhotoActionView.as_view(),
        name="client-photo-action"
    ),
    path(
        "pending-files/<str:kind>/<int:pk>/",
        PendingFileView.as_view(),
        name="pending-profile-file",
    ),


    # =========================================================
    # CLIENT - MESSAGING
    # =========================================================

    # List conversations
    path(
        "conversations/",
        ConversationListView.as_view(),
        name="conversations-list"
    ),

    # Start conversation
    path(
        "conversations/start/",
        StartConversationView.as_view(),
        name="conversation-start"
    ),

    # View conversation + messages
    path(
        "conversations/<int:pk>/",
        ConversationDetailView.as_view(),
        name="conversation-detail"
    ),

    # Send message
    path(
        "conversations/<int:pk>/send/",
        SendMessageView.as_view(),
        name="conversation-send"
    ),


    # =========================================================
    # ADMIN - REGISTRATIONS
    # =========================================================

    # Pending registrations
    path(
        "pending/",
        PendingRegistrationListView.as_view(),
        name="pending-registrations"
    ),

    # Registration detail
    path(
        "<int:pk>/",
        RegistrationDetailView.as_view(),
        name="registration-detail"
    ),

    # Approve registration
    path(
        "<int:pk>/approve/",
        RegistrationApproveView.as_view(),
        name="registration-approve"
    ),

    # Reject registration
    path(
        "<int:pk>/reject/",
        RegistrationRejectView.as_view(),
        name="registration-reject"
    ),

    # Request correction
    path(
        "<int:pk>/correction/",
        RegistrationCorrectionView.as_view(),
        name="registration-correction"
    ),

    # Publish approved registration
    path(
        "<int:pk>/publish/",
        RegistrationPublishView.as_view(),
        name="registration-publish"
    ),
]
