#!/bin/bash

# Trinity Staging Deployment Script for k3s
# This script deploys the Trinity application to Kubernetes staging environment

set -e

echo "🚀 Deploying Trinity Staging Environment to k3s..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if kubectl is available and k3s is running
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Cannot connect to k3s cluster. Is k3s running?"
        exit 1
    fi
    
    print_status "Prerequisites check passed ✓"
}

# Create namespace
deploy_namespace() {
    print_status "Creating trinity-staging namespace..."
    kubectl apply -f namespace.yaml
}

# Deploy configuration
deploy_config() {
    print_status "Deploying configuration..."
    kubectl apply -f configmaps/
    kubectl apply -f secrets/
    print_warning "⚠️  Please verify your secrets contain the correct base64 encoded values!"
}

# Deploy storage
deploy_storage() {
    print_status "Setting up storage..."
    kubectl apply -f storage/
}

# Deploy infrastructure services (databases)
deploy_infrastructure() {
    print_status "Deploying infrastructure services..."
    
    # Deploy databases
    kubectl apply -f services/postgres/
    kubectl apply -f services/mongo/
    kubectl apply -f services/redis/
    kubectl apply -f services/minio-staging.yaml
    
    print_status "Waiting for databases to be ready..."
    kubectl wait --for=condition=ready pod -l app=postgres-staging -n trinity-staging --timeout=300s
    kubectl wait --for=condition=ready pod -l app=mongo-staging -n trinity-staging --timeout=300s
    kubectl wait --for=condition=ready pod -l app=redis-staging -n trinity-staging --timeout=120s
}

# Deploy application services
deploy_applications() {
    print_status "Deploying application services..."
    
    # Deploy in dependency order
    kubectl apply -f apps/django/
    kubectl apply -f apps/flight/
    kubectl apply -f apps/fastapi/
    kubectl apply -f apps/trinity-ai/
    kubectl apply -f apps/celery/
    kubectl apply -f apps/frontend/
    
    print_status "Waiting for application services to be ready..."
    kubectl wait --for=condition=available deployment/django-staging -n trinity-staging --timeout=300s
    kubectl wait --for=condition=available deployment/fastapi-staging -n trinity-staging --timeout=300s
}

# Deploy networking
deploy_networking() {
    print_status "Deploying networking configuration..."
    kubectl apply -f networking/
}

# Run database migrations
run_migrations() {
    print_status "Running database migrations..."
    kubectl rollout restart deployment/django-staging -n trinity-staging
    sleep 30
    
    print_status "Running tenant setup (create_tenant.py)..."
    kubectl exec -it deployment/django-staging -n trinity-staging -- python create_tenant.py
}

# Verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    echo ""
    echo "📊 Deployment Status:"
    kubectl get pods -n trinity-staging
    
    echo ""
    echo "🌐 Services:"
    kubectl get services -n trinity-staging
    
    echo ""
    echo "🌍 Ingress:"
    kubectl get ingress -n trinity-staging
    
    # Test endpoints
    print_status "Testing service endpoints..."
    kubectl port-forward service/django-service 8000:8000 -n trinity-staging &
    PORT_FORWARD_PID=$!
    sleep 5
    
    if curl -s http://localhost:8000/admin/ > /dev/null; then
        print_status "✓ Django service is responding"
    else
        print_warning "⚠ Django service may not be ready yet"
    fi
    
    kill $PORT_FORWARD_PID 2>/dev/null || true
}

# Main deployment function
main() {
    print_status "Starting Trinity Staging Deployment..."
    
    check_prerequisites
    deploy_namespace
    deploy_config
    deploy_storage
    deploy_infrastructure
    deploy_applications
    deploy_networking
    run_migrations
    verify_deployment
    
    echo ""
    print_status "🎉 Trinity Staging deployment completed!"
    echo ""
    echo "🌐 Access your application:"
    echo "   • Frontend: http://your-k3s-node-ip:30082 (NodePort) or via ingress"
    echo "   • Admin: http://your-k3s-node-ip:30082/admin/"
    echo ""
    echo "📋 Useful commands:"
    echo "   • View pods: kubectl get pods -n trinity-staging"
    echo "   • View logs: kubectl logs -f deployment/django-staging -n trinity-staging"
    echo "   • Port forward: kubectl port-forward service/django-service 8000:8000 -n trinity-staging"
    echo ""
    print_warning "⚠️  Remember to:"
    echo "   1. Update your Docker images to point to your actual registry"
    echo "   2. Update MinIO external service hostname in minio-staging.yaml"
    echo "   3. Verify all secrets are properly base64 encoded"
}

# Run main function
main "$@"
