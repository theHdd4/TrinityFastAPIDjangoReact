from django.urls import path

from .views import (
    ExhibitionShareLinkView,
    DataFrameShareLinkView,
    DataFrameShareLinkRetrieveView,
    DashboardShareLinkView,
    DashboardShareLinkRetrieveView,
)

urlpatterns = [
    path("exhibition/", ExhibitionShareLinkView.as_view(), name="exhibition-share-link"),
    path("dataframe/", DataFrameShareLinkView.as_view(), name="dataframe-share-link"),
    path("dataframe/shared/<str:token>/", DataFrameShareLinkRetrieveView.as_view(), name="dataframe-share-link-retrieve"),
    path("dashboard/", DashboardShareLinkView.as_view(), name="dashboard-share-link"),
    path("dashboard/shared/<str:token>/", DashboardShareLinkRetrieveView.as_view(), name="dashboard-share-link-retrieve"),
]
