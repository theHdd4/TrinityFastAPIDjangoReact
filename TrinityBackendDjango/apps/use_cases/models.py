"""
Use Case Models - Backend database models for use case management
"""
from django.db import models
from django.contrib.auth.models import User


class UseCase(models.Model):
    """Represents a use case definition in the system"""
    
    CATEGORY_CHOICES = [
        ('marketing-analytics', 'Marketing Analytics'),
        ('data-analytics', 'Data Analytics'),
        ('predictive-analytics', 'Predictive Analytics'),
        ('customer-analytics', 'Customer Analytics'),
        ('revenue-analytics', 'Revenue Analytics'),
        ('security-analytics', 'Security Analytics'),
        ('operations-analytics', 'Operations Analytics'),
        ('custom', 'Custom'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('deprecated', 'Deprecated'),
        ('development', 'Development'),
    ]
    
    # Core fields
    id = models.CharField(max_length=100, primary_key=True)
    title = models.CharField(max_length=200)
    description = models.TextField()
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    icon = models.CharField(max_length=50, default='BarChart3')  # Lucide React icon name
    color = models.CharField(max_length=50, default='from-blue-500 to-purple-600')
    bg_gradient = models.CharField(max_length=50, default='from-blue-50 to-purple-50')
    
    # Configuration
    molecules_config = models.JSONField(default=dict)  # Molecules and atoms configuration
    deployment_config = models.JSONField(default=dict)  # Deployment settings
    
    # Status and metadata
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    version = models.CharField(max_length=20, default='1.0.0')
    is_active = models.BooleanField(default=True)
    
    # Ownership
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'use_cases'
        verbose_name = 'Use Case'
        verbose_name_plural = 'Use Cases'
        ordering = ['title']
    
    def __str__(self):
        return f"{self.title} ({self.id})"


class UseCaseDeployment(models.Model):
    """Represents a deployed instance of a use case"""
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('deploying', 'Deploying'),
        ('running', 'Running'),
        ('failed', 'Failed'),
        ('stopped', 'Stopped'),
        ('updating', 'Updating'),
    ]
    
    # Core relationships
    use_case = models.ForeignKey(UseCase, on_delete=models.CASCADE)
    project = models.ForeignKey('registry.Project', on_delete=models.CASCADE)
    workflow = models.ForeignKey('workflows.Workflow', on_delete=models.CASCADE, null=True, blank=True)
    
    # Deployment details
    deployment_id = models.CharField(max_length=200, unique=True)  # Format: {client_name}/{app_name}/{project_name}
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Configuration
    deployment_config = models.JSONField(default=dict)
    environment_variables = models.JSONField(default=dict)
    resource_requirements = models.JSONField(default=dict)
    
    # Infrastructure details
    kubernetes_namespace = models.CharField(max_length=100, default='trinity-dev')
    service_endpoints = models.JSONField(default=list)
    health_check_urls = models.JSONField(default=list)
    
    # Metadata
    deployed_by = models.ForeignKey(User, on_delete=models.CASCADE)
    deployed_at = models.DateTimeField(auto_now_add=True)
    last_updated = models.DateTimeField(auto_now=True)
    
    # Health and monitoring
    health_status = models.CharField(max_length=20, default='unknown')
    last_health_check = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'use_case_deployments'
        verbose_name = 'Use Case Deployment'
        verbose_name_plural = 'Use Case Deployments'
        unique_together = ['use_case', 'project']
        ordering = ['-deployed_at']
    
    def __str__(self):
        return f"{self.use_case.title} - {self.deployment_id}"


class UseCaseExecution(models.Model):
    """Tracks execution of use case workflows"""
    
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
        ('timeout', 'Timeout'),
    ]
    
    # Core relationships
    deployment = models.ForeignKey(UseCaseDeployment, on_delete=models.CASCADE)
    workflow_run = models.ForeignKey('workflows.WorkflowRun', on_delete=models.CASCADE, null=True, blank=True)
    
    # Execution details
    execution_id = models.CharField(max_length=100, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued')
    
    # Input/Output
    input_data = models.JSONField(default=dict)
    output_data = models.JSONField(default=dict)
    results = models.JSONField(default=dict)
    
    # Performance metrics
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    
    # Resource usage
    cpu_usage = models.FloatField(null=True, blank=True)
    memory_usage = models.FloatField(null=True, blank=True)
    
    # Error handling
    error_message = models.TextField(blank=True)
    error_details = models.JSONField(default=dict)
    
    # Metadata
    executed_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'use_case_executions'
        verbose_name = 'Use Case Execution'
        verbose_name_plural = 'Use Case Executions'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.deployment.use_case.title} - {self.execution_id}"


class UseCaseTemplate(models.Model):
    """Template for creating new use cases"""
    
    # Core fields
    name = models.CharField(max_length=200)
    description = models.TextField()
    category = models.CharField(max_length=50, choices=UseCase.CATEGORY_CHOICES)
    
    # Template configuration
    template_config = models.JSONField(default=dict)
    default_molecules = models.JSONField(default=dict)
    default_atoms = models.JSONField(default=dict)
    
    # Deployment template
    docker_template = models.TextField(blank=True)
    kubernetes_template = models.JSONField(default=dict)
    helm_chart_template = models.JSONField(default=dict)
    
    # Metadata
    version = models.CharField(max_length=20, default='1.0.0')
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'use_case_templates'
        verbose_name = 'Use Case Template'
        verbose_name_plural = 'Use Case Templates'
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} Template"
