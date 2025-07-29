from django.urls import path
from .views import SessionInitView, SessionStateView, SessionUpdateView, SessionEndView

urlpatterns = [
    path("init", SessionInitView.as_view(), name="session-init"),
    path("state", SessionStateView.as_view(), name="session-state"),
    path("update", SessionUpdateView.as_view(), name="session-update"),
    path("end", SessionEndView.as_view(), name="session-end"),
]
