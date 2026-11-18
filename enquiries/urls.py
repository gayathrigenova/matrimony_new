from django.urls import path

from .views import ContactEnquiryView


urlpatterns = [
    path("contact/", ContactEnquiryView.as_view(), name="contact-enquiry"),
]
