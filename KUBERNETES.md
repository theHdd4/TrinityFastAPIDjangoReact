# Trinity Kubernetes Deployment Guide

This guide explains how to deploy the Trinity application to Kubernetes using Helm charts, specifically designed for local development with K3s.

## 🎯 Overview

The Trinity Kubernetes setup provides:
- **All services** from Docker Compose now running in Kubernetes
- **Local development access** via NodePort services
- **Persistent storage** for databases and files
- **Health checks** and proper resource management
- **Easy deployment** via Helm charts and PowerShell scripts

## 🛠️ Prerequisites

### Required Tools
1. **K3s** - Lightweight Kubernetes distribution
2. **kubectl** - Kubernetes command-line tool
3. **Helm** - Kubernetes package manager
4. **Docker** - For building images (optional)
5. **PowerShell** - For running deployment scripts

### Installation Commands

```powershell
# Install K3s on Windows (via WSL2 or Linux VM)
# OR use Docker Desktop with Kubernetes enabled
# OR use minikube for local development

# Install kubectl
winget install Kubernetes.kubectl

# Install Helm
winget install Helm.Helm

# Verify installations
kubectl version --client
helm version
```

## 🚀 Quick Start

### 1. Build Docker Images (Optional)
```powershell
# Build all Trinity images
.\deploy-trinity.ps1 -Action build-images
```

### 2. Deploy Trinity to Kubernetes
```powershell
# Install Trinity with Helm
.\deploy-trinity.ps1 -Action install

# Or install manually
helm install trinity ./helm-chart --namespace trinity --create-namespace
```

### 3. Check Deployment Status
```powershell
# Check status
.\deploy-trinity.ps1 -Action status

# Or manually
kubectl get pods -n trinity
kubectl get services -n trinity
```

### 4. Access Your Application
Once deployed, Trinity will be available at:

- **Main Frontend**: http://localhost:30080 🎯
- **Django Backend**: http://localhost:30000
- **FastAPI Backend**: http://localhost:30001
- **Trinity AI**: http://localhost:30002

## 📋 Service Access Points

| Service | Local URL | Purpose |
|---------|-----------|---------|
| **Frontend** | http://localhost:30080 | Main Trinity application |
| **Django Web** | http://localhost:30000 | Django admin & APIs |
| **FastAPI** | http://localhost:30001 | Data processing APIs |
| **Trinity AI** | http://localhost:30002 | AI agent services |
| **PostgreSQL** | localhost:30432 | Database access |
| **MongoDB** | localhost:30017 | Document database |
| **Redis** | localhost:30379 | Cache & queue |
| **MinIO API** | http://localhost:30900 | Object storage API |
| **MinIO Console** | http://localhost:30901 | Storage management |
| **PgAdmin** | http://localhost:30050 | PostgreSQL admin |
| **Mongo Express** | http://localhost:30082 | MongoDB admin |

## 🏗️ Architecture

### Kubernetes Components

#### Namespaces
- `trinity` - Contains all Trinity services

#### Persistent Volumes
- `postgres-pvc` - PostgreSQL data (5Gi)
- `mongodb-pvc` - MongoDB data (5Gi) 
- `redis-pvc` - Redis data (2Gi)
- `minio-pvc` - MinIO object storage (10Gi)

#### Services
- **ClusterIP** services for internal communication
- **NodePort** services for external access
- **ConfigMaps** for environment variables
- **Secrets** for sensitive data

#### Deployments
- Database services (PostgreSQL, MongoDB, Redis)
- Storage services (MinIO)
- Backend services (Django, FastAPI, Celery)
- AI services (Trinity AI)
- Frontend service (React/Nginx)
- Management tools (PgAdmin, Mongo Express)

### Resource Allocation

| Service | CPU Request | Memory Request | CPU Limit | Memory Limit |
|---------|-------------|----------------|-----------|--------------|
| PostgreSQL | 250m | 256Mi | 500m | 512Mi |
| MongoDB | 250m | 256Mi | 500m | 512Mi |
| Redis | 100m | 128Mi | 200m | 256Mi |
| MinIO | 250m | 256Mi | 500m | 512Mi |
| Django Web | 250m | 512Mi | 500m | 1Gi |
| FastAPI | 250m | 512Mi | 500m | 1Gi |
| Trinity AI | 250m | 512Mi | 500m | 1Gi |
| Frontend | 100m | 128Mi | 200m | 256Mi |

## 📁 File Structure

```
helm-chart/
├── Chart.yaml              # Helm chart metadata
├── values.yaml              # Configuration values
└── templates/
    ├── namespace.yaml       # Trinity namespace
    ├── persistent-volumes.yaml # PVCs for storage
    ├── config.yaml          # ConfigMaps & Secrets
    ├── postgres.yaml        # PostgreSQL deployment
    ├── mongodb.yaml         # MongoDB deployment
    ├── redis.yaml           # Redis deployment
    ├── minio.yaml           # MinIO deployment
    ├── web.yaml             # Django backend
    ├── fastapi.yaml         # FastAPI backend (to be created)
    ├── trinity-ai.yaml      # AI services (to be created)
    ├── frontend.yaml        # React frontend (to be created)
    ├── celery.yaml          # Celery worker (to be created)
    ├── pgadmin.yaml         # PgAdmin (to be created)
    └── mongo-express.yaml   # Mongo Express (to be created)
```

## 🔧 Configuration

### Environment Variables
All configuration is managed through:
- `values.yaml` - Main configuration file
- `ConfigMap` - Non-sensitive environment variables
- `Secret` - Sensitive data (passwords, keys)

### Key Configuration Options

```yaml
global:
  namespace: trinity
  environment: dev
  hostIP: "127.0.0.1"
  storageClass: "local-path"

# Database configurations
postgres:
  enabled: true
  database: trinity_db
  username: trinity_user
  password: trinity_pass
  storage: 5Gi

# Resource limits
resources:
  web:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "1Gi" 
      cpu: "500m"
```

## 🚀 Deployment Commands

### Using PowerShell Script (Recommended)

```powershell
# Install Trinity
.\deploy-trinity.ps1 -Action install

# Upgrade Trinity
.\deploy-trinity.ps1 -Action upgrade

# Check status
.\deploy-trinity.ps1 -Action status

# Uninstall Trinity
.\deploy-trinity.ps1 -Action uninstall

# Build images
.\deploy-trinity.ps1 -Action build-images

# Dry run (test without applying)
.\deploy-trinity.ps1 -Action install -DryRun
```

### Using Helm Directly

```bash
# Install
helm install trinity ./helm-chart --namespace trinity --create-namespace

# Upgrade
helm upgrade trinity ./helm-chart --namespace trinity

# Uninstall
helm uninstall trinity --namespace trinity

# Status
helm status trinity --namespace trinity
```

### Using kubectl

```bash
# Get all resources
kubectl get all -n trinity

# Get pods
kubectl get pods -n trinity -o wide

# Get services
kubectl get services -n trinity

# Get persistent volumes
kubectl get pvc -n trinity

# View logs
kubectl logs -f deployment/web -n trinity
kubectl logs -f deployment/trinity-ai -n trinity

# Execute commands in pods
kubectl exec -it deployment/postgres -n trinity -- psql -U trinity_user -d trinity_db
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Pods Not Starting
```bash
# Check pod status
kubectl get pods -n trinity

# Describe pod for details
kubectl describe pod <pod-name> -n trinity

# Check logs
kubectl logs <pod-name> -n trinity
```

#### 2. Services Not Accessible
```bash
# Check services
kubectl get services -n trinity

# Check if NodePorts are configured
kubectl get services -n trinity -o yaml

# Test service connectivity
kubectl exec -it <pod-name> -n trinity -- curl http://service-name:port
```

#### 3. Storage Issues
```bash
# Check persistent volumes
kubectl get pv
kubectl get pvc -n trinity

# Check storage class
kubectl get storageclass
```

#### 4. Image Pull Issues
```bash
# Check image availability
docker images | grep trinity

# Build missing images
.\deploy-trinity.ps1 -Action build-images

# Or manually build
docker build -t trinity-web:latest ./TrinityBackendDjango/
```

### Health Checks

All services include health checks:
- **Readiness Probes** - Service is ready to receive traffic
- **Liveness Probes** - Service is running properly

```bash
# Check pod health
kubectl describe pod <pod-name> -n trinity | grep -A 10 "Conditions"
```

## 🔄 Development Workflow

### Local Development
1. Make code changes in your local directories
2. Build new images: `.\deploy-trinity.ps1 -Action build-images`
3. Upgrade deployment: `.\deploy-trinity.ps1 -Action upgrade`
4. Test changes via NodePort services

### Hot Reloading (Advanced)
For development with hot reloading, you can:
1. Mount local code directories as volumes
2. Use development images with file watchers
3. Configure services to reload on file changes

## 🔐 Security Considerations

### Secrets Management
- Database passwords stored in Kubernetes Secrets
- MinIO credentials properly encrypted
- No sensitive data in ConfigMaps

### Network Security
- Services use ClusterIP for internal communication
- NodePorts only for development access
- Production would use Ingress controllers

### Storage Security
- Persistent volumes with proper access modes
- Regular backup strategies recommended

## 📊 Monitoring & Logging

### Viewing Logs
```bash
# Real-time logs
kubectl logs -f deployment/web -n trinity

# Previous logs
kubectl logs deployment/web -n trinity --previous

# All pods logs
kubectl logs -l app=web -n trinity
```

### Monitoring Resources
```bash
# Resource usage
kubectl top pods -n trinity
kubectl top nodes

# Resource descriptions
kubectl describe deployment web -n trinity
```

## 🚀 Production Considerations

For production deployment, consider:

1. **Image Registry** - Use private container registry
2. **Ingress Controller** - Replace NodePorts with Ingress
3. **TLS Certificates** - Add HTTPS support
4. **Resource Limits** - Fine-tune based on load
5. **Monitoring** - Add Prometheus/Grafana
6. **Backup Strategy** - Automated database backups
7. **High Availability** - Multiple replicas for critical services
8. **Security** - Network policies, RBAC, Pod Security Standards

## 📚 Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [K3s Documentation](https://k3s.io/)
- [Docker Documentation](https://docs.docker.com/)

---

**Need Help?** 
- Check the troubleshooting section above
- Review Kubernetes logs: `kubectl logs <pod-name> -n trinity`
- Verify service status: `kubectl get all -n trinity`