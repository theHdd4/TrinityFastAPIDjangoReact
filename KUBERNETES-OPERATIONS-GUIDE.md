# Kubernetes Operations Guide - Step-by-Step

## Table of Contents
1. [Prerequisites & Setup](#prerequisites--setup)
2. [Deployment - Starting Services](#deployment---starting-services)
3. [Monitoring - Viewing Logs](#monitoring---viewing-logs)
4. [Service Management](#service-management)
5. [Troubleshooting](#troubleshooting)
6. [Accessing Services](#accessing-services)
7. [Cloudflare Tunnel Operations](#cloudflare-tunnel-operations)
8. [Common Operational Tasks](#common-operational-tasks)
9. [Quick Reference Commands](#quick-reference-commands)

---

## Prerequisites & Setup

### What You Need

1. **Kubernetes Cluster** (one of):
   - k3s on Windows WSL2 (recommended for local)
   - Minikube
   - Docker Desktop with Kubernetes
   - Cloud Kubernetes (GKE, EKS, AKS)

2. **Tools Installed**:
   - `kubectl` - Kubernetes CLI
   - `helm` - Kubernetes package manager
   - `docker` - For building images (optional)

3. **Configuration Files**:
   - `kubernetes/trinity-helm/` - Helm chart
   - `cloudflared/` - Tunnel configuration

### Verify Your Setup

```powershell
# Check Kubernetes cluster is running
kubectl cluster-info
# Expected: Kubernetes control plane is running at ...

# Check nodes are ready
kubectl get nodes
# Expected: STATUS = Ready

# Check Helm is installed
helm version
# Expected: version.BuildInfo{Version:"v3.x.x" ...}

# Check your context/namespace
kubectl config current-context
# Shows which cluster you're connected to

kubectl config get-contexts
# Shows all available clusters
```

---

## Deployment - Starting Services

### Method 1: Using Helm (Recommended)

Helm deploys all services with one command.

#### Step 1: Prepare Namespace

```powershell
# Create namespace for Trinity
kubectl create namespace trinity-dev

# Verify namespace exists
kubectl get namespaces
# Should see: trinity-dev
```

#### Step 2: Review Configuration

```powershell
# Check what values are configured
cat kubernetes/trinity-helm/values.yaml

# Key things to verify:
# - global.domain (should be your domain)
# - global.namespace (should be trinity-dev)
# - images.*.repository (image names)
# - Database passwords (postgresql.password, etc.)
```

#### Step 3: Deploy with Helm

```powershell
# Navigate to project root
cd D:\Kubernetes\TrinityFastAPIDjangoReact

# Install Trinity using Helm
helm install trinity kubernetes/trinity-helm/ -n trinity-dev

# Expected output:
# NAME: trinity
# NAMESPACE: trinity-dev
# STATUS: deployed
# REVISION: 1
```

**What this does:**
- Creates namespace `trinity-dev`
- Deploys 4 StatefulSets (PostgreSQL, MongoDB, Redis, MinIO)
- Deploys 6 Deployments (Django, FastAPI, Flight, Celery, AI, Frontend)
- Creates Services for each component
- Creates Ingress for routing
- Sets up ConfigMaps and Secrets

#### Step 4: Verify Deployment

```powershell
# Check Helm release
helm list -n trinity-dev

# Check all resources
kubectl get all -n trinity-dev

# Expected output:
# NAME                                READY   STATUS    RESTARTS   AGE
# pod/trinity-django-xxx              2/2     Running   0          2m
# pod/trinity-fastapi-xxx             2/2     Running   0          2m
# pod/trinity-frontend-xxx            2/2     Running   0          2m
# pod/trinity-ai-xxx                  1/1     Running   0          2m
# pod/celery-xxx                      2/2     Running   0          2m
# pod/flight-xxx                      1/1     Running   0          2m
# pod/postgres-0                      1/1     Running   0          2m
# pod/mongodb-0                       1/1     Running   0          2m
# pod/redis-0                         1/1     Running   0          2m
# pod/minio-0                         1/1     Running   0          2m
```

### Method 2: Using kubectl (Manual)

If you don't want to use Helm, you can apply YAML files directly.

```powershell
# Apply all templates manually
kubectl apply -f kubernetes/trinity-helm/templates/ -n trinity-dev

# Or apply specific files
kubectl apply -f kubernetes/trinity-helm/templates/namespace.yaml
kubectl apply -f kubernetes/trinity-helm/templates/configmap.yaml
kubectl apply -f kubernetes/trinity-helm/templates/postgresql-statefulset.yaml
# ... and so on
```

---

## Monitoring - Viewing Logs

### Viewing Pod Status

#### See All Pods

```powershell
# List all pods in trinity-dev namespace
kubectl get pods -n trinity-dev

# Watch pods in real-time (updates every 2 seconds)
kubectl get pods -n trinity-dev --watch

# Get detailed pod information
kubectl get pods -n trinity-dev -o wide
# Shows: IP addresses, nodes, and more
```

#### Check Pod Details

```powershell
# Describe a specific pod (detailed info)
kubectl describe pod <pod-name> -n trinity-dev

# Example:
kubectl describe pod trinity-django-7d8f9b5c4-abc12 -n trinity-dev

# This shows:
# - Pod events (why it started, stopped, crashed)
# - Resource usage
# - Volume mounts
# - Container status
# - Recent logs
```

### Viewing Logs

#### Basic Log Viewing

```powershell
# View logs from a pod
kubectl logs <pod-name> -n trinity-dev

# Example: View Django logs
kubectl logs trinity-django-7d8f9b5c4-abc12 -n trinity-dev

# Follow logs in real-time (like tail -f)
kubectl logs -f <pod-name> -n trinity-dev

# Example: Follow FastAPI logs
kubectl logs -f trinity-fastapi-6c5d8a9b2-xyz34 -n trinity-dev
```

#### Multi-Container Pods

Some pods have multiple containers. Specify which one:

```powershell
# List containers in a pod
kubectl get pod <pod-name> -n trinity-dev -o jsonpath='{.spec.containers[*].name}'

# View logs from specific container
kubectl logs <pod-name> -c <container-name> -n trinity-dev

# Example: Django pod with init container
kubectl logs trinity-django-xxx -c django -n trinity-dev
kubectl logs trinity-django-xxx -c init-postgres -n trinity-dev
```

#### Advanced Log Options

```powershell
# Show last 100 lines
kubectl logs --tail=100 <pod-name> -n trinity-dev

# Show logs from last hour
kubectl logs --since=1h <pod-name> -n trinity-dev

# Show logs with timestamps
kubectl logs --timestamps <pod-name> -n trinity-dev

# Show previous container logs (if pod crashed and restarted)
kubectl logs --previous <pod-name> -n trinity-dev
```

#### View Logs by Deployment

```powershell
# View logs from ALL pods in a deployment
kubectl logs -l app=trinity-django -n trinity-dev

# Follow logs from all FastAPI pods
kubectl logs -f -l app=trinity-fastapi -n trinity-dev
```

### Viewing Events

Events show what happened in your cluster.

```powershell
# See all events in namespace
kubectl get events -n trinity-dev

# Watch events in real-time
kubectl get events -n trinity-dev --watch

# Sort events by time
kubectl get events -n trinity-dev --sort-by='.lastTimestamp'

# Events for specific pod
kubectl get events -n trinity-dev --field-selector involvedObject.name=<pod-name>
```

### Monitoring Resource Usage

```powershell
# Install metrics-server (if not installed)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# View pod resource usage
kubectl top pods -n trinity-dev

# View node resource usage
kubectl top nodes

# Example output:
# NAME                           CPU(cores)   MEMORY(bytes)
# trinity-django-xxx             150m         512Mi
# trinity-fastapi-xxx            100m         384Mi
# trinity-ai-xxx                 500m         2Gi
```

### Real-Time Monitoring Dashboard

```powershell
# Option 1: Kubernetes Dashboard (web UI)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml
kubectl proxy
# Open browser: http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/

# Option 2: k9s (terminal UI - install separately)
# Install from: https://k9scli.io/
k9s -n trinity-dev

# Option 3: Lens (desktop app - install separately)
# Install from: https://k8slens.dev/
```

---

## Service Management

### Starting Services

Services start automatically when you deploy. But if you need to scale:

```powershell
# Scale up replicas
kubectl scale deployment trinity-django --replicas=3 -n trinity-dev

# Scale down
kubectl scale deployment trinity-django --replicas=1 -n trinity-dev

# Scale multiple at once
kubectl scale deployment trinity-django trinity-fastapi --replicas=2 -n trinity-dev
```

### Stopping Services

```powershell
# Scale to 0 (stops all pods but keeps configuration)
kubectl scale deployment trinity-django --replicas=0 -n trinity-dev

# Delete specific deployment (removes everything)
kubectl delete deployment trinity-django -n trinity-dev

# Stop all Trinity services (keeps databases)
kubectl delete deployment --all -n trinity-dev

# Delete entire Trinity installation (everything!)
helm uninstall trinity -n trinity-dev
```

### Restarting Services

```powershell
# Restart a deployment (rolling restart)
kubectl rollout restart deployment trinity-django -n trinity-dev

# Restart all deployments
kubectl rollout restart deployment -n trinity-dev

# Restart a StatefulSet
kubectl rollout restart statefulset postgres -n trinity-dev

# Force delete and recreate a pod
kubectl delete pod <pod-name> -n trinity-dev
# Kubernetes will automatically create a new one
```

### Checking Service Status

```powershell
# Check deployment status
kubectl get deployments -n trinity-dev

# Example output:
# NAME              READY   UP-TO-DATE   AVAILABLE   AGE
# trinity-django    2/2     2            2           10m
# trinity-fastapi   2/2     2            2           10m

# Check StatefulSet status
kubectl get statefulsets -n trinity-dev

# Check Service endpoints
kubectl get services -n trinity-dev

# Check Ingress
kubectl get ingress -n trinity-dev
```

### Updating Services

#### Update Docker Image

```powershell
# Update image tag
kubectl set image deployment/trinity-django trinity-django=localhost:5000/trinity-django:v1.1.0 -n trinity-dev

# Check rollout status
kubectl rollout status deployment/trinity-django -n trinity-dev

# Rollback if something breaks
kubectl rollout undo deployment/trinity-django -n trinity-dev
```

#### Update Configuration

```powershell
# Edit ConfigMap
kubectl edit configmap trinity-config -n trinity-dev

# After editing, restart pods to pick up changes
kubectl rollout restart deployment trinity-django -n trinity-dev

# Or update via Helm
helm upgrade trinity kubernetes/trinity-helm/ -n trinity-dev
```

---

## Troubleshooting

### Common Issues & Solutions

#### 1. Pods Not Starting (Pending Status)

```powershell
# Check why pod is pending
kubectl describe pod <pod-name> -n trinity-dev

# Common reasons:
# - Insufficient resources (CPU/Memory)
# - Image pull errors
# - PVC not bound
```

**Solution for insufficient resources:**
```powershell
# Reduce resource requests in values.yaml
# Then upgrade:
helm upgrade trinity kubernetes/trinity-helm/ -n trinity-dev
```

**Solution for image pull errors:**
```powershell
# Check image name
kubectl describe pod <pod-name> -n trinity-dev | grep Image

# Build and push image
docker build -t localhost:5000/trinity-django:v1.0.0 ./TrinityBackendDjango
docker push localhost:5000/trinity-django:v1.0.0
```

#### 2. Pods Crashing (CrashLoopBackOff)

```powershell
# Check logs
kubectl logs <pod-name> -n trinity-dev

# Check previous logs (from before crash)
kubectl logs --previous <pod-name> -n trinity-dev

# Common reasons:
# - Database not ready (init containers should prevent this)
# - Wrong environment variables
# - Missing dependencies
```

**Solution:**
```powershell
# Check dependencies are running
kubectl get pods -n trinity-dev | grep postgres
kubectl get pods -n trinity-dev | grep mongo

# If database not ready, wait or restart
kubectl rollout restart statefulset postgres -n trinity-dev
```

#### 3. Service Not Accessible

```powershell
# Check service exists
kubectl get svc trinity-django -n trinity-dev

# Check endpoints
kubectl get endpoints trinity-django -n trinity-dev
# Should show pod IPs

# Test from inside cluster
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n trinity-dev -- sh
# Inside the pod:
curl http://trinity-django:8000/health
```

**Solution if endpoints are empty:**
```powershell
# Check if pods have correct labels
kubectl get pods -n trinity-dev --show-labels

# Service selector must match pod labels
kubectl describe svc trinity-django -n trinity-dev
```

#### 4. Ingress Not Working

```powershell
# Check Ingress status
kubectl get ingress -n trinity-dev

# Describe Ingress
kubectl describe ingress trinity-ingress -n trinity-dev

# Check Ingress controller is running
kubectl get pods -n kube-system | grep traefik
```

**Solution:**
```powershell
# Verify Ingress class is correct
kubectl describe ingress trinity-ingress -n trinity-dev | grep "Class"

# For k3s, should be "traefik"
# For minikube, should be "nginx"
```

#### 5. Database Connection Errors

```powershell
# Check database pods are running
kubectl get pods -n trinity-dev | grep -E "postgres|mongo|redis"

# Check database logs
kubectl logs postgres-0 -n trinity-dev
kubectl logs mongodb-0 -n trinity-dev

# Test database connection from app pod
kubectl exec -it trinity-django-xxx -n trinity-dev -- bash
# Inside pod:
python manage.py dbshell
```

**Solution:**
```powershell
# Check environment variables
kubectl exec trinity-django-xxx -n trinity-dev -- env | grep POSTGRES

# Check ConfigMap
kubectl get configmap trinity-config -n trinity-dev -o yaml

# Check Secrets
kubectl get secret postgres-secret -n trinity-dev -o yaml
```

### Debugging Tools

#### Execute Commands in Pods

```powershell
# Get a shell in a pod
kubectl exec -it <pod-name> -n trinity-dev -- /bin/bash

# Run a single command
kubectl exec <pod-name> -n trinity-dev -- ls -la /app

# Example: Check Django migrations
kubectl exec trinity-django-xxx -n trinity-dev -- python manage.py showmigrations
```

#### Copy Files To/From Pods

```powershell
# Copy from pod to local machine
kubectl cp trinity-dev/<pod-name>:/app/logs/error.log ./error.log

# Copy from local to pod
kubectl cp ./config.json trinity-dev/<pod-name>:/app/config.json
```

#### Port Forward for Testing

```powershell
# Forward pod port to localhost
kubectl port-forward <pod-name> 8000:8000 -n trinity-dev

# Forward service port
kubectl port-forward svc/trinity-django 8000:8000 -n trinity-dev

# Access at: http://localhost:8000
```

#### Network Debugging

```powershell
# Run a debug pod with network tools
kubectl run -it --rm netdebug --image=nicolaka/netshoot --restart=Never -n trinity-dev

# Inside the pod, you can use:
# - curl
# - wget
# - dig
# - nslookup
# - ping
# - traceroute

# Example: Test DNS
nslookup trinity-django.trinity-dev.svc.cluster.local

# Example: Test connectivity
curl http://trinity-django:8000/health
```

---

## Accessing Services

### Local Access (Development)

#### Option 1: Port Forwarding (Manual)

```powershell
# Forward individual services
kubectl port-forward svc/trinity-frontend 8080:80 -n trinity-dev
kubectl port-forward svc/trinity-django 8000:8000 -n trinity-dev
kubectl port-forward svc/trinity-fastapi 8001:8001 -n trinity-dev
kubectl port-forward svc/trinity-ai 8002:8002 -n trinity-dev

# Access at:
# http://localhost:8080 - Frontend
# http://localhost:8000 - Django
# http://localhost:8001 - FastAPI
# http://localhost:8002 - AI Service
```

#### Option 2: Using the PowerShell Script (Automatic)

```powershell
# Start port forwarding for all services
.\scripts\expose-trinity-network.ps1

# This script:
# - Detects your device IP
# - Forwards all ports
# - Shows URLs
# - Keeps running until you press Ctrl+C

# Access from any device on your network:
# http://<your-ip>:8080 - Frontend
# http://<your-ip>:8000 - Django Admin
# http://<your-ip>:8001 - FastAPI Docs
# http://<your-ip>:8002 - Trinity AI

# Stop port forwarding
.\scripts\expose-trinity-network.ps1 -Stop
```

#### Option 3: Using Ingress with /etc/hosts

```powershell
# Get Ingress IP (for k3s, usually localhost or node IP)
kubectl get ingress -n trinity-dev

# Add to C:\Windows\System32\drivers\etc\hosts (requires admin)
# Add this line:
127.0.0.1 trinity.quantmatrixai.com

# Access at:
# http://trinity.quantmatrixai.com/         - Frontend
# http://trinity.quantmatrixai.com/admin    - Django
# http://trinity.quantmatrixai.com/api      - FastAPI
# http://trinity.quantmatrixai.com/trinityai - AI
```

### Remote Access (Production)

#### Via Cloudflare Tunnel

See [Cloudflare Tunnel Operations](#cloudflare-tunnel-operations) section below.

#### Via LoadBalancer (Cloud)

If you're on a cloud provider (GKE, EKS, AKS):

```powershell
# Change service type to LoadBalancer
kubectl patch svc trinity-ingress -n trinity-dev -p '{"spec": {"type": "LoadBalancer"}}'

# Get external IP
kubectl get svc trinity-ingress -n trinity-dev

# Example output:
# NAME              TYPE           EXTERNAL-IP     PORT(S)        AGE
# trinity-ingress   LoadBalancer   35.224.123.45   80:30080/TCP   5m

# Access at external IP:
# http://35.224.123.45
```

---

## Cloudflare Tunnel Operations

### Understanding Your Setup

You have **three** cloudflared directories:
1. `cloudflared/` - Production tunnel (trinity.quantmatrixai.com)
2. `cloudflared-dev/` - Development tunnel (trinity-dev.quantmatrixai.com)
3. `cloudflared-stag/` - Staging tunnel

### Running Cloudflared with Docker Compose

#### For Production

```powershell
# Navigate to cloudflared directory
cd cloudflared

# Start tunnel
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop tunnel
docker-compose down
```

#### For Development

```powershell
cd cloudflared-dev
docker-compose up -d
docker-compose logs -f
```

### Configuring Tunnel for Kubernetes

The tunnel needs to connect to your Kubernetes Ingress.

#### If Using Docker Compose Mode

Your `cloudflared/tunnelCreds/config.yml` should point to Traefik:
```yaml
ingress:
  - hostname: trinity.quantmatrixai.com
    service: http://traefik:80
  - service: http_status:404
```

**Make sure Docker Compose is running!**

#### If Using Kubernetes Mode

Update `cloudflared/tunnelCreds/config.yml` to use host network:
```yaml
ingress:
  - hostname: trinity.quantmatrixai.com
    service: http://host.docker.internal:80  # Connects to k3s Traefik on host
  - service: http_status:404
```

Then update `cloudflared/docker-compose.yml`:
```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./tunnelCreds:/etc/cloudflared:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"  # Add this line
    networks:
      - trinity-net
```

Restart:
```powershell
cd cloudflared
docker-compose down
docker-compose up -d
```

### Running Cloudflared in Kubernetes

For production Kubernetes deployments, run cloudflared inside Kubernetes.

#### Step 1: Create Secret

```powershell
# Copy your credentials file
kubectl create secret generic cloudflared-credentials `
  --from-file=credentials.json=cloudflared/tunnelCreds/e0a883c4-bc43-4742-b47a-96ef902e6bb3.json `
  -n trinity-dev
```

#### Step 2: Create ConfigMap

```powershell
kubectl create configmap cloudflared-config `
  --from-file=config.yml=cloudflared/tunnelCreds/config.yml `
  -n trinity-dev
```

#### Step 3: Deploy Cloudflared

Create `cloudflared-k8s.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared
  namespace: trinity-dev
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cloudflared
  template:
    metadata:
      labels:
        app: cloudflared
    spec:
      containers:
      - name: cloudflared
        image: cloudflare/cloudflared:latest
        args:
          - tunnel
          - --config
          - /etc/cloudflared/config.yml
          - run
        volumeMounts:
          - name: config
            mountPath: /etc/cloudflared
            readOnly: true
      volumes:
        - name: config
          projected:
            sources:
            - configMap:
                name: cloudflared-config
            - secret:
                name: cloudflared-credentials
```

Deploy:
```powershell
kubectl apply -f cloudflared-k8s.yaml
```

Check status:
```powershell
kubectl get pods -n trinity-dev -l app=cloudflared
kubectl logs -l app=cloudflared -n trinity-dev
```

### Verifying Tunnel Works

```powershell
# Check tunnel status in logs
docker-compose logs cloudflared

# OR for Kubernetes
kubectl logs -l app=cloudflared -n trinity-dev

# Look for:
# "Registered tunnel connection"
# "Connection established"

# Test from outside
curl https://trinity.quantmatrixai.com

# Or open in browser:
# https://trinity.quantmatrixai.com
```

---

## Common Operational Tasks

### Daily Operations

#### Check System Health

```powershell
# Quick health check
kubectl get pods -n trinity-dev

# All should be "Running" with "READY" showing correct numbers
# Example: 2/2 means 2 out of 2 containers running

# Check resource usage
kubectl top pods -n trinity-dev

# Check events for errors
kubectl get events -n trinity-dev --sort-by='.lastTimestamp' | tail -20
```

#### View Application Logs

```powershell
# Django logs (application server)
kubectl logs -l app=trinity-django -n trinity-dev --tail=100

# FastAPI logs
kubectl logs -l app=trinity-fastapi -n trinity-dev --tail=100

# AI service logs
kubectl logs -l app=trinity-ai -n trinity-dev --tail=100

# Celery worker logs
kubectl logs -l app=celery -n trinity-dev --tail=100

# Database logs
kubectl logs postgres-0 -n trinity-dev --tail=50
kubectl logs mongodb-0 -n trinity-dev --tail=50
```

### Database Management

#### Backup Database

```powershell
# Backup PostgreSQL
kubectl exec postgres-0 -n trinity-dev -- pg_dump -U trinity_user trinity_db > backup_$(Get-Date -Format 'yyyy-MM-dd').sql

# Backup MongoDB
kubectl exec mongodb-0 -n trinity-dev -- mongodump --authenticationDatabase admin -u root -p rootpass --out /tmp/backup
kubectl cp trinity-dev/mongodb-0:/tmp/backup ./mongo_backup_$(Get-Date -Format 'yyyy-MM-dd')
```

#### Restore Database

```powershell
# Restore PostgreSQL
cat backup_2025-10-14.sql | kubectl exec -i postgres-0 -n trinity-dev -- psql -U trinity_user -d trinity_db

# Restore MongoDB
kubectl cp ./mongo_backup_2025-10-14 trinity-dev/mongodb-0:/tmp/restore
kubectl exec mongodb-0 -n trinity-dev -- mongorestore --authenticationDatabase admin -u root -p rootpass /tmp/restore
```

#### Access Database Console

```powershell
# PostgreSQL console
kubectl exec -it postgres-0 -n trinity-dev -- psql -U trinity_user -d trinity_db

# MongoDB console
kubectl exec -it mongodb-0 -n trinity-dev -- mongosh -u root -p rootpass --authenticationDatabase admin

# Redis console
kubectl exec -it redis-0 -n trinity-dev -- redis-cli
```

### Application Management

#### Run Django Commands

```powershell
# Get a shell
kubectl exec -it $(kubectl get pod -l app=trinity-django -n trinity-dev -o jsonpath='{.items[0].metadata.name}') -n trinity-dev -- bash

# Or run commands directly
kubectl exec $(kubectl get pod -l app=trinity-django -n trinity-dev -o jsonpath='{.items[0].metadata.name}') -n trinity-dev -- python manage.py migrate

# Create superuser
kubectl exec -it $(kubectl get pod -l app=trinity-django -n trinity-dev -o jsonpath='{.items[0].metadata.name}') -n trinity-dev -- python manage.py createsuperuser

# Collect static files
kubectl exec $(kubectl get pod -l app=trinity-django -n trinity-dev -o jsonpath='{.items[0].metadata.name}') -n trinity-dev -- python manage.py collectstatic --noinput
```

#### Clear Cache

```powershell
# Clear Redis cache
kubectl exec redis-0 -n trinity-dev -- redis-cli FLUSHALL
```

### Updating Application

#### Build and Push New Images

```powershell
# Build Django image
docker build -t localhost:5000/trinity-django:v1.1.0 ./TrinityBackendDjango
docker push localhost:5000/trinity-django:v1.1.0

# Build FastAPI image  
docker build -t localhost:5000/trinity-fastapi:v1.1.0 ./TrinityBackendFastAPI
docker push localhost:5000/trinity-fastapi:v1.1.0

# Build AI image
docker build -t localhost:5000/trinity-ai:v1.1.0 ./TrinityAI
docker push localhost:5000/trinity-ai:v1.1.0

# Build Frontend image
docker build -t localhost:5000/trinity-frontend:v1.1.0 ./TrinityFrontend
docker push localhost:5000/trinity-frontend:v1.1.0
```

#### Deploy New Version

```powershell
# Option 1: Update via Helm (recommended)
# Edit values.yaml to change image tags
# Then:
helm upgrade trinity kubernetes/trinity-helm/ -n trinity-dev

# Option 2: Update deployment directly
kubectl set image deployment/trinity-django trinity-django=localhost:5000/trinity-django:v1.1.0 -n trinity-dev

# Watch rollout
kubectl rollout status deployment/trinity-django -n trinity-dev

# If something breaks, rollback
kubectl rollout undo deployment/trinity-django -n trinity-dev
```

### Scaling Services

```powershell
# Scale up during high traffic
kubectl scale deployment trinity-django --replicas=4 -n trinity-dev
kubectl scale deployment trinity-fastapi --replicas=4 -n trinity-dev

# Scale down to save resources
kubectl scale deployment trinity-django --replicas=1 -n trinity-dev

# Auto-scaling (HPA - requires metrics-server)
kubectl autoscale deployment trinity-django --min=2 --max=10 --cpu-percent=70 -n trinity-dev
```

---

## Quick Reference Commands

### Essential Commands Cheat Sheet

```powershell
# ========================================
# DEPLOYMENT
# ========================================
# Deploy Trinity
helm install trinity kubernetes/trinity-helm/ -n trinity-dev

# Upgrade Trinity
helm upgrade trinity kubernetes/trinity-helm/ -n trinity-dev

# Uninstall Trinity
helm uninstall trinity -n trinity-dev

# ========================================
# MONITORING
# ========================================
# View all pods
kubectl get pods -n trinity-dev

# Watch pods (live updates)
kubectl get pods -n trinity-dev --watch

# View logs
kubectl logs <pod-name> -n trinity-dev
kubectl logs -f <pod-name> -n trinity-dev          # Follow
kubectl logs -f -l app=trinity-django -n trinity-dev  # All Django pods

# View events
kubectl get events -n trinity-dev --sort-by='.lastTimestamp'

# Resource usage
kubectl top pods -n trinity-dev
kubectl top nodes

# ========================================
# DEBUGGING
# ========================================
# Describe pod (detailed info)
kubectl describe pod <pod-name> -n trinity-dev

# Get shell in pod
kubectl exec -it <pod-name> -n trinity-dev -- bash

# Port forward
kubectl port-forward svc/trinity-django 8000:8000 -n trinity-dev

# Copy files
kubectl cp trinity-dev/<pod>:/path/file ./file

# ========================================
# SERVICE MANAGEMENT
# ========================================
# Restart deployment
kubectl rollout restart deployment trinity-django -n trinity-dev

# Scale replicas
kubectl scale deployment trinity-django --replicas=3 -n trinity-dev

# Update image
kubectl set image deployment/trinity-django trinity-django=localhost:5000/trinity-django:v2 -n trinity-dev

# Rollback
kubectl rollout undo deployment/trinity-django -n trinity-dev

# ========================================
# SERVICES & NETWORKING
# ========================================
# View services
kubectl get svc -n trinity-dev

# View ingress
kubectl get ingress -n trinity-dev

# View endpoints
kubectl get endpoints -n trinity-dev

# ========================================
# STORAGE
# ========================================
# View persistent volumes
kubectl get pv
kubectl get pvc -n trinity-dev

# ========================================
# CLEANUP
# ========================================
# Delete pod (will recreate)
kubectl delete pod <pod-name> -n trinity-dev

# Delete deployment
kubectl delete deployment <name> -n trinity-dev

# Delete all deployments
kubectl delete deployment --all -n trinity-dev

# Delete namespace (deletes EVERYTHING)
kubectl delete namespace trinity-dev
```

### PowerShell Aliases (Optional)

Add to your PowerShell profile for shortcuts:

```powershell
# Edit profile
notepad $PROFILE

# Add these lines:
function k { kubectl $args }
function kgp { kubectl get pods -n trinity-dev $args }
function kgd { kubectl get deployments -n trinity-dev $args }
function kgs { kubectl get services -n trinity-dev $args }
function klf { kubectl logs -f $args -n trinity-dev }
function kd { kubectl describe $args -n trinity-dev }
function kx { kubectl exec -it $args -n trinity-dev -- bash }

# Now you can use:
# kgp = kubectl get pods -n trinity-dev
# klf pod-name = kubectl logs -f pod-name -n trinity-dev
```

---

## Workflow Examples

### Example 1: Deploy Fresh Installation

```powershell
# 1. Create namespace
kubectl create namespace trinity-dev

# 2. Deploy
helm install trinity kubernetes/trinity-helm/ -n trinity-dev

# 3. Wait for pods to be ready
kubectl wait --for=condition=ready pod --all -n trinity-dev --timeout=300s

# 4. Check status
kubectl get pods -n trinity-dev

# 5. Expose services
.\scripts\expose-trinity-network.ps1

# 6. Access frontend
# Open browser: http://localhost:8080
```

### Example 2: Update Application Code

```powershell
# 1. Make code changes in TrinityBackendDjango/

# 2. Build new image
docker build -t localhost:5000/trinity-django:v1.1.0 ./TrinityBackendDjango
docker push localhost:5000/trinity-django:v1.1.0

# 3. Update deployment
kubectl set image deployment/trinity-django trinity-django=localhost:5000/trinity-django:v1.1.0 -n trinity-dev

# 4. Watch rollout
kubectl rollout status deployment/trinity-django -n trinity-dev

# 5. Check logs for errors
kubectl logs -f -l app=trinity-django -n trinity-dev

# 6. If broken, rollback
kubectl rollout undo deployment/trinity-django -n trinity-dev
```

### Example 3: Troubleshoot Crashed Pod

```powershell
# 1. Find crashed pod
kubectl get pods -n trinity-dev | findstr "CrashLoop|Error"

# 2. View logs
kubectl logs <pod-name> -n trinity-dev

# 3. View previous logs (from before crash)
kubectl logs --previous <pod-name> -n trinity-dev

# 4. Describe pod for events
kubectl describe pod <pod-name> -n trinity-dev

# 5. Check dependencies
kubectl get pods -n trinity-dev | findstr "postgres|mongo|redis"

# 6. Try manual restart
kubectl delete pod <pod-name> -n trinity-dev
```

### Example 4: Database Maintenance

```powershell
# 1. Backup database
kubectl exec postgres-0 -n trinity-dev -- pg_dump -U trinity_user trinity_db > backup.sql

# 2. Stop application (optional, for safety)
kubectl scale deployment --all --replicas=0 -n trinity-dev

# 3. Access database console
kubectl exec -it postgres-0 -n trinity-dev -- psql -U trinity_user -d trinity_db

# 4. Run migrations or commands
kubectl exec postgres-0 -n trinity-dev -- psql -U trinity_user -d trinity_db -f /path/to/script.sql

# 5. Restart application
kubectl scale deployment trinity-django trinity-fastapi --replicas=2 -n trinity-dev
```

---

## Getting Help

### Kubernetes Documentation

- Official Docs: https://kubernetes.io/docs/
- kubectl Cheat Sheet: https://kubernetes.io/docs/reference/kubectl/cheatsheet/
- Helm Docs: https://helm.sh/docs/

### Troubleshooting Resources

- Pod Lifecycle: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/
- Debugging Pods: https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/
- Service Debugging: https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/

### Trinity-Specific

- See: `KUBERNETES-CLOUDFLARE-SETUP-EXPLAINED.md` for architecture
- See: `KUBERNETES.md` for migration guide
- See: Docker Compose docs for comparison

---

## Summary

### Key Takeaways

1. **Deploy**: Use `helm install` for easy deployment
2. **Monitor**: Use `kubectl logs` and `kubectl get pods` constantly
3. **Debug**: Use `kubectl describe` and `kubectl exec` for troubleshooting
4. **Update**: Use `helm upgrade` or `kubectl set image`
5. **Access**: Use port-forward or the PowerShell script

### Daily Commands You'll Use Most

```powershell
kubectl get pods -n trinity-dev
kubectl logs -f <pod-name> -n trinity-dev
kubectl describe pod <pod-name> -n trinity-dev
kubectl exec -it <pod-name> -n trinity-dev -- bash
.\scripts\expose-trinity-network.ps1
```

### Remember

- **Pods** are ephemeral (they can restart/move)
- **Services** provide stable networking
- **StatefulSets** are for stateful apps (databases)
- **Deployments** are for stateless apps
- **Ingress** routes external traffic
- **ConfigMaps** and **Secrets** hold configuration

Good luck with your Kubernetes journey! 🚀

