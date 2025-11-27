from django.db import models


class TrinityV1Agent(models.Model):
    """
    Trinity V1 Agent model to store agent registry definitions.
    Stored in the public schema for global access.
    """
    agent_id = models.CharField(max_length=100, unique=True, help_text="Agent identifier")
    name = models.CharField(max_length=150, help_text="Agent name")
    description = models.TextField(blank=True, help_text="Agent description")
    category = models.CharField(max_length=100, blank=True, help_text="Agent category")
    tags = models.JSONField(default=list, blank=True, help_text="List of tags for the agent")
    route_count = models.IntegerField(default=0, help_text="Number of routes registered")
    routes = models.JSONField(default=list, blank=True, help_text="Array of route metadata objects")
    is_active = models.BooleanField(default=True, help_text="Whether this agent is available and functional")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'trinity_v1_agents'
        ordering = ["name"]
        verbose_name = "Trinity V1 Agent"
        verbose_name_plural = "Trinity V1 Agents"
    
    def __str__(self):
        return f"{self.name} ({self.agent_id})"



