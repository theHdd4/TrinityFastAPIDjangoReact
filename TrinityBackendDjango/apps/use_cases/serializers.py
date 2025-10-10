"""
Use Case Serializers - API serializers for use case models
"""
from rest_framework import serializers
from .models import UseCase, UseCaseDeployment, UseCaseExecution, UseCaseTemplate


class UseCaseSerializer(serializers.ModelSerializer):
    """Serializer for UseCase model"""
    
    class Meta:
        model = UseCase
        fields = [
            'id', 'title', 'description', 'category', 'icon', 'color', 'bg_gradient',
            'molecules_config', 'deployment_config', 'status', 'version', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class UseCaseDeploymentSerializer(serializers.ModelSerializer):
    """Serializer for UseCaseDeployment model"""
    
    use_case_title = serializers.CharField(source='use_case.title', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    deployed_by_name = serializers.CharField(source='deployed_by.username', read_only=True)
    
    class Meta:
        model = UseCaseDeployment
        fields = [
            'id', 'deployment_id', 'status', 'deployment_config', 'environment_variables',
            'resource_requirements', 'kubernetes_namespace', 'service_endpoints',
            'health_check_urls', 'health_status', 'last_health_check', 'deployed_at',
            'last_updated', 'use_case_title', 'project_name', 'deployed_by_name'
        ]
        read_only_fields = ['id', 'deployed_at', 'last_updated']


class UseCaseExecutionSerializer(serializers.ModelSerializer):
    """Serializer for UseCaseExecution model"""
    
    deployment_id = serializers.CharField(source='deployment.deployment_id', read_only=True)
    use_case_title = serializers.CharField(source='deployment.use_case.title', read_only=True)
    executed_by_name = serializers.CharField(source='executed_by.username', read_only=True)
    
    class Meta:
        model = UseCaseExecution
        fields = [
            'id', 'execution_id', 'status', 'input_data', 'output_data', 'results',
            'start_time', 'end_time', 'duration_seconds', 'cpu_usage', 'memory_usage',
            'error_message', 'error_details', 'created_at', 'deployment_id',
            'use_case_title', 'executed_by_name'
        ]
        read_only_fields = ['id', 'created_at']


class UseCaseTemplateSerializer(serializers.ModelSerializer):
    """Serializer for UseCaseTemplate model"""
    
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = UseCaseTemplate
        fields = [
            'id', 'name', 'description', 'category', 'template_config',
            'default_molecules', 'default_atoms', 'docker_template',
            'kubernetes_template', 'helm_chart_template', 'version',
            'is_active', 'created_at', 'created_by_name'
        ]
        read_only_fields = ['id', 'created_at']


class UseCaseDeploymentRequestSerializer(serializers.Serializer):
    """Serializer for use case deployment requests"""
    
    use_case_id = serializers.CharField(max_length=100)
    project_id = serializers.IntegerField()
    workflow_id = serializers.IntegerField(required=False, allow_null=True)
    deployment_config = serializers.JSONField(required=False, default=dict)


class UseCaseExecutionRequestSerializer(serializers.Serializer):
    """Serializer for use case execution requests"""
    
    input_data = serializers.JSONField(required=False, default=dict)
    execution_config = serializers.JSONField(required=False, default=dict)
