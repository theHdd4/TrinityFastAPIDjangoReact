from django.urls import path
from . import views

app_name = 'trinity_v1_agents'

urlpatterns = [
    path('', views.TrinityV1AgentListCreateView.as_view(), name='list-create'),
    path('<str:agent_id>/', views.TrinityV1AgentDetailView.as_view(), name='detail'),
]



