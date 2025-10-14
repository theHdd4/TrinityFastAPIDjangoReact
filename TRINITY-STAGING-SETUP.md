# Trinity Staging Environment Setup Guide

## Overview

This guide helps you set up Trinity on Kubernetes with:
- ✅ Local network access (device IP)
- ✅ Internet access via Cloudflare Tunnel (trinity-stag.quantmatrixai.com)
- ✅ Fault tolerance with multiple replicas
- ✅ Health checks and auto-restart

## Architecture

```
                    INTERNET
                       │
                       ↓
        ┌──────────────────────────┐
        │  CLOUDFLARE NETWORK      │
        │  trinity-stag.           │
        │  quantmatrixai.com       │
        └──────────┬───────────────┘
                   │
        Encrypted Tunnel (Outbound)
                   │
                   ↓
        ┌──────────────────────────┐
        │  YOUR WINDOWS MACHINE    │
        │  (10.2.4.48)             │
        │                          │
        │  ┌────────────────────┐  │
        │  │ Cloudflared        │  │
        │  │ Container          │  │
        │  │ network_mode: host │  │
        │  └────────┬───────────┘  │
        │           │              │
        │  ┌────────▼───────────┐  │
        │  │ localhost:80       │  │
        │  │ (Port Forward)     │  │
        │  └────────┬───────────┘  │
        │           │              │
        │  ┌────────▼───────────┐  │
        │  │ Minikube Cluster   │  │
        │  │                    │  │
        │  │  ┌──────────────┐  │  │
        │  │  │NGINX Ingress │  │  │
        │  │  │              │  │  │
        │  │  │ Path Routing:│  │  │
        │  │  │ /admin → web │  │  │
        │  │  │ /api→fastapi │  │  │
        │  │  │ /→frontend   │  │  │
        │  │  └──────────────┘  │  │
        │  │                    │  │
        │  │  Services:         │  │
        │  │  - frontend:80 x2  │  │
        │  │  - web:8000 x2     │  │
        │  │  - fastapi:8001 x2 │  │
        │  │  - trinity-ai:8002 │  │
        │  │  - postgres:5432   │  │
        │  │  - mongodb:27017   │  │
        │  │  - redis:6379      │  │
        │  │  - minio:9000/9001 │  │
        │  └────────────────────┘  │
        └───────────────────────────┘
                   │
        NodePorts for Local Access
                   │
                   ↓
        Other devices on network:
        http://10.2.4.48:8080
```

## Port Reference (Standard - DO NOT CHANGE)

| Service | Container Port | Service Port | NodePort | Host Port (Port-Forward) |
|---------|----------------|--------------|----------|--------------------------|
| Frontend | 80 | 80 | 30080 | 8080 |
| Django Web | 8000 | 8000 | 30000 | 8000 |
| FastAPI | 8001 | 8001 | 30001 | 8001 |
| Trinity AI | 8002 | 8002 | 30002 | 8002 |
| Flight | 8815 | 8815 | 30815 | - |
| PostgreSQL | 5432 | 5432 | 30432 | - |
| MongoDB | 27017 | 27017 | 30017 | - |
| Redis | 6379 | 6379 | 30379 | - |
| MinIO API | 9000 | 9000 | 30900 | - |
| MinIO Console | 9001 | 9001 | 30901 | 9001 |

## Access Methods

### Method 1: Public Internet (via Cloudflare)

**URLs:**
- Frontend: https://trinity-stag.quantmatrixai.com
- Django Admin: https://trinity-stag.quantmatrixai.com/admin
- FastAPI Docs: https://trinity-stag.quantmatrixai.com/api/docs
- Trinity AI: https://trinity-stag.quantmatrixai.com/trinityai

**How it works:**
- Cloudflare routes traffic to tunnel
- Tunnel connects to localhost:80 (Ingress)
- Ingress routes by path to appropriate service

### Method 2: Local Network (WiFi/LAN)

**URLs (from any device on same network):**
- Frontend: http://10.2.4.48:8080
- Django Admin: http://10.2.4.48:8000/admin
- FastAPI Docs: http://10.2.4.48:8001/docs
- Trinity AI: http://10.2.4.48:8002

**Setup:**
```bash
# Run port forwarding script
.\scripts\expose-trinity-network.ps1
```

**How it works:**
- kubectl port-forward exposes services on all interfaces (0.0.0.0)
- Binds to your Windows machine IP
- Other devices can access via device IP

### Method 3: Direct Minikube Access (Your laptop only)

**URLs:**
```bash
# Get service URLs
minikube service frontend-nodeport -n trinity --url
# Returns: http://127.0.0.1:61341 (dynamic port)
```

## Fault Tolerance Features

### 1. Multiple Replicas
- Frontend: 2 pods
- Django Web: 2 pods
- FastAPI: 2 pods
- Celery: 2 pods
- Trinity AI: 1 pod (resource intensive)

**How it works:**
- If one pod crashes, others handle traffic
- Service load balances across healthy pods
- Kubernetes automatically restarts failed pods

### 2. Health Checks

Each service has:
- **Liveness Probe**: Restarts pod if unhealthy
- **Readiness Probe**: Removes from load balancer if not ready

Example: Django Web
- Checks: HTTP GET /admin/login/
- Every: 10 seconds
- Fails after: 3 consecutive failures
- Restart delay: 30 seconds

### 3. Resource Limits

Prevents one service from consuming all resources:
```yaml
resources:
  requests:  # Guaranteed minimum
    memory: 512Mi
    cpu: 250m
  limits:    # Maximum allowed
    memory: 1Gi
    cpu: 500m
```

### 4. Persistent Storage

Databases use PersistentVolumeClaims:
- PostgreSQL: 5Gi
- MongoDB: 5Gi
- Redis: 2Gi
- MinIO: 10Gi

Data survives pod restarts/crashes.

## Setup Instructions

### Quick Start (Local Network Access)

```bash
# 1. Ensure Minikube is running
minikube status

# 2. Start Minikube if stopped
minikube start

# 3. Deploy Trinity with fault tolerance
helm upgrade trinity ./helm-chart -n trinity

# 4. Expose on local network (keep terminal open)
.\scripts\expose-trinity-network.ps1

# 5. Access from other devices
# http://10.2.4.48:8080
```

### Full Setup (Internet Access via Cloudflare)

```bash
# 1-4: Same as Quick Start above

# 5. Expose Ingress for Cloudflare (separate terminal)
.\scripts\expose-ingress-for-cloudflare.ps1

# 6. Configure Cloudflare Tunnel
# Edit: cloudflared-stag/tunnelCreds/config.yml
# Add your tunnel ID and credentials file

# 7. Start Cloudflare Tunnel
cd cloudflared-stag
docker-compose up -d

# 8. Verify tunnel connection
docker-compose logs -f

# 9. Test public access
# https://trinity-stag.quantmatrixai.com
```

## Testing Fault Tolerance

### Test Pod Restart
```bash
# Delete a pod
kubectl delete pod -n trinity <pod-name>

# Watch it restart automatically
kubectl get pods -n trinity -w

# Verify service remained accessible during restart
curl http://10.2.4.48:8080
```

### Test Load Balancing
```bash
# Check which pods are serving requests
kubectl logs -n trinity -l app=web --tail=10

# Delete one web pod
kubectl delete pod -n trinity <one-web-pod>

# Service continues via the other pod
curl http://10.2.4.48:8000/admin/login/
```

### Monitor Health Checks
```bash
# Check pod events
kubectl describe pod -n trinity <pod-name>

# Look for:
# - Liveness probe succeeded/failed
# - Readiness probe succeeded/failed
```

## Deployment Commands

### Deploy to Local Minikube
```bash
helm upgrade trinity ./helm-chart -n trinity --create-namespace
```

### Deploy to Staging (with staging values)
```bash
helm upgrade trinity ./helm-chart \
  -n trinity-stag \
  --create-namespace \
  --values ./helm-chart/values-staging.yaml
```

### Update After Code Changes
```bash
# 1. Point Docker to Minikube
minikube docker-env --shell powershell | Invoke-Expression

# 2. Rebuild images
.\deploy-trinity.ps1 -Action build-images

# 3. Restart pods to use new images
kubectl rollout restart deployment/web -n trinity
kubectl rollout restart deployment/fastapi -n trinity
kubectl rollout restart deployment/trinity-ai -n trinity
kubectl rollout restart deployment/frontend -n trinity
```

## Troubleshooting

### Pods Not Starting
```bash
# Check pod status
kubectl get pods -n trinity

# Check pod logs
kubectl logs -n trinity <pod-name>

# Check pod events
kubectl describe pod -n trinity <pod-name>

# Common issues:
# - ImagePullBackOff: Image not in Minikube, rebuild with minikube docker-env
# - CrashLoopBackOff: Application error, check logs
# - Init:0/3: Waiting for dependencies (postgres/mongo/redis)
```

### Can't Access from Local Network
```bash
# 1. Verify port forwarding script is running
Get-Job

# 2. Check Windows Firewall
# Allow incoming connections on ports 8080, 8000, 8001, 8002

# 3. Verify device IP
ipconfig

# 4. Test from same machine first
curl http://localhost:8080
```

### Cloudflare Tunnel Not Working
```bash
# 1. Check tunnel status
cd cloudflared-stag
docker-compose logs

# 2. Verify Ingress port forward is running
Get-Job | Where-Object {$_.Name -eq "ingress-forward"}

# 3. Test Ingress locally
curl http://localhost

# 4. Check Cloudflare Dashboard
# Tunnels → trinity-staging → Should show "Healthy"
```

## Current Status

Run this to check everything:
```bash
# Check all pods
kubectl get pods -n trinity

# Check deployments and replicas
kubectl get deployments -n trinity

# Check ingress
kubectl get ingress -n trinity

# Check services
kubectl get services -n trinity
```

Expected output:
- Celery: 2/2 Running
- Frontend: 2/2 Running
- Web: 2/2 Running
- FastAPI: 2/2 Running
- Trinity-AI: 1/1 Running
- Infrastructure: All 1/1 Running

## Next Steps

1. ✅ Local network access working
2. ✅ Fault tolerance with replicas enabled
3. ⏳ Configure Cloudflare Tunnel (need tunnel ID)
4. ⏳ Test public access
5. ⏳ Set up monitoring (Phase 2)
6. ⏳ Set up automated backups (Phase 2)

