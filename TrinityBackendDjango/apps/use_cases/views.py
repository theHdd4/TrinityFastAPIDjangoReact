"""
Use Case Views - API endpoints for use case management and deployment
"""
from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User
from .models import UseCase, UseCaseDeployment, UseCaseExecution, UseCaseTemplate
from .serializers import UseCaseSerializer, UseCaseDeploymentSerializer, UseCaseExecutionSerializer
import json
import uuid
from datetime import datetime


class UseCaseViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing use cases
    """
    serializer_class = UseCaseSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter use cases by active status"""
        return UseCase.objects.filter(is_active=True)
    
    @action(detail=False, methods=['post'])
    def deploy(self, request):
        """
        Deploy a use case to a project
        Expects: { use_case_id, project_id, workflow_id?, deployment_config? }
        """
        try:
            use_case_id = request.data.get('use_case_id')
            project_id = request.data.get('project_id')
            workflow_id = request.data.get('workflow_id')
            deployment_config = request.data.get('deployment_config', {})
            
            print(f"🚀 Deploying use case: {use_case_id} to project: {project_id}")
            
            # Validate use case
            use_case = get_object_or_404(UseCase, id=use_case_id, is_active=True)
            
            # Validate project ownership
            from apps.registry.models import Project
            project = get_object_or_404(Project, id=project_id, owner=request.user)
            
            # Create deployment
            deployment_id = f"{project.name}/{use_case_id}/{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            deployment = UseCaseDeployment.objects.create(
                use_case=use_case,
                project=project,
                deployment_id=deployment_id,
                deployment_config=deployment_config,
                environment_variables={
                    'USE_CASE': use_case_id,
                    'PROJECT_ID': str(project_id),
                    'DEPLOYMENT_ID': deployment_id
                },
                resource_requirements=use_case.deployment_config.get('resource_requirements', {}),
                deployed_by=request.user
            )
            
            # Link workflow if provided
            if workflow_id:
                from apps.workflows.models import Workflow
                try:
                    workflow = Workflow.objects.get(id=workflow_id, project=project)
                    deployment.workflow = workflow
                    deployment.save()
                except Workflow.DoesNotExist:
                    print(f"⚠️ Workflow {workflow_id} not found, continuing without workflow link")
            
            print(f"✅ Deployment created: {deployment.deployment_id}")
            
            return Response({
                'success': True,
                'deployment': UseCaseDeploymentSerializer(deployment).data,
                'message': f'Use case {use_case.title} deployed successfully'
            })
            
        except Exception as e:
            print(f"❌ Deployment failed: {str(e)}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def deployed(self, request):
        """
        Get all deployed use cases for the current user's projects
        """
        try:
            # Get user's projects
            from apps.registry.models import Project
            user_projects = Project.objects.filter(owner=request.user)
            
            # Get deployments for user's projects
            deployments = UseCaseDeployment.objects.filter(
                project__in=user_projects
            ).select_related('use_case', 'project')
            
            serializer = UseCaseDeploymentSerializer(deployments, many=True)
            
            return Response({
                'success': True,
                'deployments': serializer.data
            })
            
        except Exception as e:
            print(f"❌ Failed to get deployments: {str(e)}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def execute(self, request, pk=None):
        """
        Execute a use case deployment
        """
        try:
            deployment = get_object_or_404(UseCaseDeployment, id=pk)
            input_data = request.data.get('input_data', {})
            execution_config = request.data.get('execution_config', {})
            
            # Create execution record
            execution_id = f"exec_{uuid.uuid4().hex[:8]}"
            
            execution = UseCaseExecution.objects.create(
                deployment=deployment,
                execution_id=execution_id,
                input_data=input_data,
                executed_by=request.user
            )
            
            print(f"⚡ Execution created: {execution_id} for deployment: {deployment.deployment_id}")
            
            # TODO: Implement actual execution logic here
            # This would typically trigger the use case workflow execution
            
            return Response({
                'success': True,
                'execution': UseCaseExecutionSerializer(execution).data,
                'message': f'Execution {execution_id} started'
            })
            
        except Exception as e:
            print(f"❌ Execution failed: {str(e)}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)


class UseCaseDeploymentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing use case deployments
    """
    serializer_class = UseCaseDeploymentSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter deployments by user's projects"""
        from apps.registry.models import Project
        user_projects = Project.objects.filter(owner=self.request.user)
        return UseCaseDeployment.objects.filter(project__in=user_projects)
    
    @action(detail=True, methods=['post'])
    def stop(self, request, pk=None):
        """
        Stop a deployment
        """
        try:
            deployment = get_object_or_404(UseCaseDeployment, id=pk)
            deployment.status = 'stopped'
            deployment.save()
            
            print(f"🛑 Deployment stopped: {deployment.deployment_id}")
            
            return Response({
                'success': True,
                'message': f'Deployment {deployment.deployment_id} stopped'
            })
            
        except Exception as e:
            print(f"❌ Failed to stop deployment: {str(e)}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['get'])
    def status(self, request, pk=None):
        """
        Get deployment status and health
        """
        try:
            deployment = get_object_or_404(UseCaseDeployment, id=pk)
            
            # TODO: Implement actual health checking logic
            # This would typically check Kubernetes pod status, service health, etc.
            
            return Response({
                'success': True,
                'deployment': UseCaseDeploymentSerializer(deployment).data,
                'health': {
                    'status': deployment.status,
                    'health_status': deployment.health_status,
                    'last_health_check': deployment.last_health_check
                }
            })
            
        except Exception as e:
            print(f"❌ Failed to get deployment status: {str(e)}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)


class UseCaseExecutionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing use case executions
    """
    serializer_class = UseCaseExecutionSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter executions by user's deployments"""
        user_deployments = UseCaseDeployment.objects.filter(
            project__owner=self.request.user
        )
        return UseCaseExecution.objects.filter(deployment__in=user_deployments)


class UseCaseTemplateViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing use case templates
    """
    queryset = UseCaseTemplate.objects.filter(is_active=True)
    permission_classes = [IsAuthenticated]
    
    @action(detail=True, methods=['post'])
    def create_use_case(self, request, pk=None):
        """
        Create a new use case from a template
        """
        try:
            template = get_object_or_404(UseCaseTemplate, id=pk)
            use_case_data = request.data
            
            # Create use case from template
            use_case = UseCase.objects.create(
                id=use_case_data.get('id'),
                title=use_case_data.get('title'),
                description=use_case_data.get('description'),
                category=use_case_data.get('category', template.category),
                molecules_config=template.default_molecules,
                deployment_config=template.deployment_template,
                created_by=request.user
            )
            
            print(f"✅ Use case created from template: {use_case.id}")
            
            return Response({
                'success': True,
                'use_case': UseCaseSerializer(use_case).data,
                'message': f'Use case {use_case.title} created from template'
            })
            
        except Exception as e:
            print(f"❌ Failed to create use case from template: {str(e)}")
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
