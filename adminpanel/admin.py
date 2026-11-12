from django.contrib import admin

from .models import FAQ


@admin.register(FAQ)
class FAQAdmin(admin.ModelAdmin):
    list_display = ("question", "category", "is_active", "sort_order", "updated_at")
    list_filter = ("category", "is_active")
    search_fields = ("question", "answer")
    list_editable = ("is_active", "sort_order")
