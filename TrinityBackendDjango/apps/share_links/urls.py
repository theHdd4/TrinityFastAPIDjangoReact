from django.urls import path

from .views import ExhibitionShareLinkView

urlpatterns = [
    path("exhibition/", ExhibitionShareLinkView.as_view(), name="exhibition-share-link"),
]
