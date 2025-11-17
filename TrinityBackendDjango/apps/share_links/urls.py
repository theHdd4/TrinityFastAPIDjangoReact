from django.urls import path

from .views import (
    ExhibitionShareLinkView,
    DataFrameShareLinkView,
    DataFrameShareLinkRetrieveView,
)

urlpatterns = [
    path("exhibition/", ExhibitionShareLinkView.as_view(), name="exhibition-share-link"),
    path("dataframe/", DataFrameShareLinkView.as_view(), name="dataframe-share-link"),
    path("dataframe/shared/<str:token>/", DataFrameShareLinkRetrieveView.as_view(), name="dataframe-share-link-retrieve"),
]
