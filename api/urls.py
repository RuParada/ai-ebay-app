from django.urls import path

from . import views

urlpatterns = [
    path("describe/", views.describe, name="describe"),
]
