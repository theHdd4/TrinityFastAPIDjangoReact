from rest_framework import generics
from .models import TrinityV1Agent
from .serializers import TrinityV1AgentSerializer


class TrinityV1AgentListCreateView(generics.ListCreateAPIView):
    """
    List all agents or create a new agent.
    """
    queryset = TrinityV1Agent.objects.all()
    serializer_class = TrinityV1AgentSerializer


class TrinityV1AgentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Retrieve, update or delete an agent.
    """
    queryset = TrinityV1Agent.objects.all()
    serializer_class = TrinityV1AgentSerializer
    lookup_field = 'agent_id'



