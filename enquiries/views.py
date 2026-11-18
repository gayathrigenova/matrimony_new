import logging
import smtplib

from anymail.exceptions import AnymailError
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMessage
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from notifications.emailing import safe_email_error

from .serializers import ContactEnquirySerializer


logger = logging.getLogger(__name__)


class ContactEnquiryView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ContactEnquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enquiry = serializer.validated_data
        body = (
            "A new message was submitted through the Contact Us form.\n\n"
            f"Full Name: {enquiry['name']}\n"
            f"Mobile Number: {enquiry['phone']}\n"
            f"Email Address: {enquiry['email']}\n"
            f"Subject: {enquiry['subject']}\n\n"
            "Message:\n"
            f"{enquiry['message']}\n"
        )
        email = EmailMessage(
            subject="Contact Us Form Submission",
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=["keralakkaramatrimony@gmail.com"],
            reply_to=[enquiry["email"]],
        )

        try:
            sent_count = email.send(fail_silently=False)
        except (
            AnymailError,
            ImproperlyConfigured,
            OSError,
            smtplib.SMTPException,
            ValueError,
        ) as exc:
            logger.error(
                "Contact enquiry email delivery failed: exception=%s detail=%s",
                type(exc).__name__,
                safe_email_error(exc, (enquiry["email"],)),
            )
            return Response(
                {"detail": "We could not send your message right now. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if sent_count != 1:
            logger.error(
                "Contact enquiry email was not accepted by the configured email backend."
            )
            return Response(
                {"detail": "We could not send your message right now. Please try again."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {"message": "Your message has been received. We'll contact you soon."},
            status=status.HTTP_200_OK,
        )
