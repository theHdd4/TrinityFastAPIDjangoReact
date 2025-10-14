# Kubernetes & Cloudflare Tunnel Setup - Comprehensive Explanation

## Table of Contents
1. [Current Architecture Overview](#current-architecture-overview)
2. [What You Have Set Up](#what-you-have-set-up)
3. [The Problem: Docker Compose vs Kubernetes](#the-problem-docker-compose-vs-kubernetes)
4. [How Cloudflare Tunnel Works](#how-cloudflare-tunnel-works)
5. [Why It Broke](#why-it-broke)
6. [Two Deployment Modes Explained](#two-deployment-modes-explained)
7. [Network Architecture](#network-architecture)
8. [Solutions & Recommendations](#solutions--recommendations)

---

## Current Architecture Overview

Trinity is a **microservices application** with 13 services deployed using either Docker Compose or Kubernetes. You have configurations for both, which is causing confusion.

### Your Services (13 Total)

**Infrastructure Layer (4 services):**
- PostgreSQL (port 5432) - Main database
- MongoDB (port 27017) - Document storage
- Redis (internal) - Caching & Celery broker
- MinIO (ports 9000/9001) - Object storage (S3-compatible)

**Application Layer (6 services):**
- Django/Web (port 8000) - Backend admin, handles `/admin` routes
- FastAPI (port 8001) - Orchestration service, handles `/api` routes
- Flight (port 8815) - Apache Arrow data transfer server
- Trinity-AI (port 8002) - AI/ML service, handles `/trinityai` routes
- Celery (no port) - Background task worker
- Frontend (port 8080) - React app, serves `/` routes

**Management Tools (3 services):**
- PgAdmin (port 5050) - PostgreSQL admin UI
- Mongo Express (port 8082) - MongoDB admin UI
- Traefik (port 9080) - Reverse proxy (Docker Compose only)

---

## What You Have Set Up

### 1. Docker Compose Setup (`docker-compose.yml`)

**How it works:**
```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                    (trinity-net)                         │
│                                                           │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐      │
│  │ Frontend │      │  Django  │      │  FastAPI │      │
│  │  :8080   │      │  :8000   │      │  :8001   │      │
│  └────┬─────┘      └────┬─────┘      └────┬─────┘      │
│       │                  │                  │             │
│       └──────────────────┼──────────────────┘             │
│                          │                                │
│                    ┌─────▼─────┐                         │
│                    │  Traefik  │ ◄─── Port 9080          │
│                    │  :80      │                          │
│                    └─────┬─────┘                         │
│                          │                                │
│                          │                                │
│  ┌───────────────────────▼───────────────────────┐      │
│  │         Cloudflared Tunnel                     │      │
│  │  (connects to traefik:80 inside network)      │      │
│  └───────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              Cloudflare Edge (Internet)
                           │
                           ▼
            https://trinity.quantmatrixai.com
```

**Key Points:**
- All services run as Docker containers on `trinity-net` network
- Traefik acts as reverse proxy, routing based on path:
  - `/admin` → Django (port 8000)
  - `/api` → FastAPI (port 8001)
  - `/trinityai` → Trinity-AI (port 8002)
  - `/` → Frontend (port 8080)
- Cloudflared runs in Docker, connects to `traefik:80` via Docker network
- Traffic flows: Internet → Cloudflare → Cloudflared → Traefik → Services

### 2. Kubernetes Setup (`kubernetes/trinity-helm/`)

**How it works:**
```
┌─────────────────────────────────────────────────────────┐
│              Kubernetes Cluster (k3s)                    │
│              Namespace: trinity-dev                      │
│                                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Ingress (Traefik Ingress Class)        │  │
│  │    Host: trinity.quantmatrixai.com               │  │
│  │                                                    │  │
│  │    /admin    → trinity-django:8000                │  │
│  │    /api      → trinity-fastapi:8001               │  │
│  │    /trinityai → trinity-ai:8002                   │  │
│  │    /         → trinity-frontend:80                │  │
│  └──────────────────────────────────────────────────┘  │
│              ▲                                           │
│              │ (ClusterIP - internal only)              │
│              │                                           │
│  ┌───────────┴──────────────────────────────────────┐  │
│  │              Services (ClusterIP)                 │  │
│  │                                                    │  │
│  │  trinity-django:8000                              │  │
│  │  trinity-fastapi:8001                             │  │
│  │  trinity-ai:8002                                  │  │
│  │  trinity-frontend:80                              │  │
│  └────────────────────────────────────────────────────┘  │
│              ▲                                           │
│              │                                           │
│  ┌───────────┴──────────────────────────────────────┐  │
│  │         Deployments & Pods                        │  │
│  │                                                    │  │
│  │  Django (2 replicas), FastAPI (2 replicas)       │  │
│  │  Frontend (2 replicas), AI (1 replica)           │  │
│  │  Celery (2 replicas), Flight (1 replica)         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │         StatefulSets (Databases)                  │  │
│  │                                                    │  │
│  │  PostgreSQL, MongoDB, Redis, MinIO                │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
                           │ (NO DIRECT CONNECTION!)
                           ▼
            ❌ Cloudflared can't connect
```

**Key Points:**
- Services run as Kubernetes Pods (not Docker containers)
- Services use ClusterIP (internal cluster networking)
- Ingress resource handles routing (no separate Traefik container)
- **CRITICAL**: Cloudflared Docker container can't reach Kubernetes services!

---

## The Problem: Docker Compose vs Kubernetes

### Why You Have Two Setups

You have **TWO SEPARATE Helm chart directories**:

1. **`helm-chart/`** - Full-featured chart with detailed configurations
2. **`kubernetes/trinity-helm/`** - Simplified chart for local k3s deployment

**This is confusing but intentional** - one for production (cloud) and one for local development.

### The Networking Mismatch

| Aspect | Docker Compose | Kubernetes |
|--------|---------------|------------|
| **Network** | `trinity-net` (Docker bridge) | Kubernetes cluster network |
| **Service Discovery** | DNS via Docker (`traefik:80`) | DNS via Kubernetes (`trinity-django.trinity-dev.svc.cluster.local`) |
| **External Access** | Port mapping (9080→80) | NodePort or LoadBalancer or Ingress |
| **Reverse Proxy** | Traefik container | Traefik Ingress Controller (built into k3s) |
| **Cloudflared Connection** | ✅ Can connect to `traefik:80` | ❌ Can't connect (different networks) |

---

## How Cloudflare Tunnel Works

### The Tunnel Flow

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Internet   │─────▶│  Cloudflare  │─────▶│ Cloudflared  │─────▶│   Your App   │
│    User      │      │     Edge     │      │   Daemon     │      │   (Local)    │
└──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘
```

### Cloudflared Configuration (`cloudflared/tunnelCreds/config.yml`)

```yaml
tunnel: e0a883c4-bc43-4742-b47a-96ef902e6bb3
credentials-file: /etc/cloudflared/e0a883c4-bc43-4742-b47a-96ef902e6bb3.json

ingress:
  - hostname: trinity.quantmatrixai.com
    service: http://traefik:80    # ← This is the problem!
  - service: http_status:404
```

**What this means:**
- Cloudflared runs as a Docker container
- It's connected to the `trinity-net` Docker network
- It tries to connect to `traefik:80` (expects a Traefik Docker container)
- **BUT** in Kubernetes, there's no Traefik container on `trinity-net`!

### The Docker Compose `cloudflared` Service

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./tunnelCreds:/etc/cloudflared:ro
    networks:
      - trinity-net    # ← Looking for traefik on THIS network
```

---

## Why It Broke

### Scenario 1: You Migrated from Docker Compose to Kubernetes

**What happened:**
1. You stopped Docker Compose (`docker-compose down`)
2. You deployed to Kubernetes (`helm install` or `kubectl apply`)
3. Cloudflared is still running in Docker, looking for `traefik:80`
4. Traefik container no longer exists (because you're using Kubernetes Ingress)
5. Cloudflared can't connect → Tunnel breaks
6. External traffic from `trinity.quantmatrixai.com` fails

**The Error You Likely See:**
```
cloudflared: error connecting to origin: dial tcp: lookup traefik: no such host
```

### Scenario 2: Running Both Simultaneously

**What happened:**
1. You have Docker Compose AND Kubernetes running at the same time
2. Port conflicts (both try to use 5432, 27017, 8000, 8001, etc.)
3. Services fail to start
4. Cloudflared connects to Docker Compose Traefik, but services are in Kubernetes
5. Requests go to wrong place

### Scenario 3: Kubernetes Ingress Not Exposed

**What happened:**
1. Kubernetes is running fine
2. But the Ingress (Traefik in k3s) is only accessible inside the cluster
3. Cloudflared can't reach it from outside the cluster
4. Your PowerShell script (`expose-trinity-network.ps1`) uses `kubectl port-forward`
5. Port forwarding is manual and doesn't help Cloudflared

---

## Two Deployment Modes Explained

### Mode 1: Docker Compose (Original Setup)

**When to use:** Local development, simple deployments

**Architecture:**
```
Cloudflared (Docker) → Traefik (Docker) → Services (Docker)
                     ALL on trinity-net network
```

**Commands:**
```bash
# Start everything
docker-compose up -d

# Start Cloudflared tunnel
cd cloudflared
docker-compose up -d

# Access locally
http://localhost:9080
https://trinity.quantmatrixai.com (via tunnel)
```

**Pros:**
- Simple, one command to start
- Cloudflared integration works out of the box
- Easy to debug (docker logs)

**Cons:**
- No fault tolerance (single instance)
- No auto-scaling
- Limited resource management

### Mode 2: Kubernetes (Production Setup)

**When to use:** Production, high availability, scalability

**Architecture:**
```
Cloudflared (?) → ??? → Kubernetes Ingress → Services (Kubernetes Pods)
                         
                Need to bridge this gap!
```

**Commands:**
```bash
# Deploy to Kubernetes
helm install trinity kubernetes/trinity-helm/ -n trinity-dev

# Check status
kubectl get pods -n trinity-dev

# Access locally (requires port-forward)
.\scripts\expose-trinity-network.ps1
http://localhost:8080
```

**Pros:**
- High availability (multiple replicas)
- Auto-restart on failure
- Resource limits and requests
- Rolling updates
- Scalability

**Cons:**
- More complex
- Cloudflared integration needs extra work
- Steeper learning curve

---

## Network Architecture

### Docker Compose Network (`trinity-net`)

```
┌─────────────────────────────────────────────────────────┐
│ Docker Bridge Network: trinity-net                       │
│ Subnet: 172.20.0.0/16 (example)                         │
│                                                           │
│  Container IP addresses (assigned by Docker):            │
│    postgres       → 172.20.0.2:5432                      │
│    mongo          → 172.20.0.3:27017                     │
│    redis          → 172.20.0.4:6379                      │
│    minio          → 172.20.0.5:9000,9001                 │
│    web (django)   → 172.20.0.6:8000                      │
│    fastapi        → 172.20.0.7:8001                      │
│    trinity-ai     → 172.20.0.8:8002                      │
│    frontend       → 172.20.0.9:80                        │
│    traefik        → 172.20.0.10:80 ◄─── Cloudflared     │
│    cloudflared    → 172.20.0.11                          │
│                                                           │
│  DNS: Docker provides automatic name resolution          │
│       "traefik" resolves to 172.20.0.10                  │
└─────────────────────────────────────────────────────────┘
```

### Kubernetes Network

```
┌─────────────────────────────────────────────────────────┐
│ Kubernetes Cluster Network                              │
│ Pod Network: 10.42.0.0/16 (k3s default)                 │
│ Service Network: 10.43.0.0/16 (k3s default)             │
│                                                           │
│  Services (ClusterIP - stable virtual IPs):              │
│    postgres       → 10.43.1.1:5432                       │
│    mongodb        → 10.43.1.2:27017                      │
│    redis          → 10.43.1.3:6379                       │
│    minio          → 10.43.1.4:9000,9001                  │
│    trinity-django → 10.43.1.5:8000                       │
│    trinity-fastapi→ 10.43.1.6:8001                       │
│    trinity-ai     → 10.43.1.7:8002                       │
│    trinity-frontend→ 10.43.1.8:80                        │
│                                                           │
│  Pods (actual containers, IPs change on restart):        │
│    trinity-django-xyz  → 10.42.0.10:8000                 │
│    trinity-django-abc  → 10.42.0.11:8000                 │
│    trinity-fastapi-def → 10.42.0.12:8001                 │
│    ...                                                    │
│                                                           │
│  Ingress (Traefik IngressController):                   │
│    Runs as a pod inside cluster                          │
│    Listens on port 80/443                                │
│    Accessible via NodePort or LoadBalancer               │
│                                                           │
│  DNS: Kubernetes CoreDNS                                 │
│       "trinity-django" resolves to 10.43.1.5             │
│       Full FQDN: trinity-django.trinity-dev.svc.cluster.local │
└─────────────────────────────────────────────────────────┘

  ▲
  │ (No connection to Docker network!)
  ▼

❌ Cloudflared in Docker can't reach this network
```

---

## Solutions & Recommendations

### Solution 1: Keep Docker Compose + Cloudflared (Simplest)

**Best for:** Development, quick testing

**Steps:**
1. Stop Kubernetes: `helm uninstall trinity -n trinity-dev`
2. Start Docker Compose: `docker-compose up -d`
3. Start Cloudflared: `cd cloudflared && docker-compose up -d`
4. Access via tunnel: `https://trinity.quantmatrixai.com`

**Files to use:**
- `docker-compose.yml`
- `cloudflared/docker-compose.yml`
- `cloudflared/tunnelCreds/config.yml`

---

### Solution 2: Kubernetes + Cloudflared in Kubernetes (Recommended for Production)

**Best for:** Production, high availability

**How it works:**
```
Cloudflared (K8s Pod) → Traefik Ingress (K8s) → Services (K8s)
       ALL in the same cluster network
```

**Steps:**

1. **Deploy Cloudflared as a Kubernetes Deployment**

Create `cloudflared-deployment.yaml`:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cloudflared-credentials
  namespace: trinity-dev
type: Opaque
stringData:
  credentials.json: |
    # Copy content from cloudflared/tunnelCreds/e0a883c4-bc43-4742-b47a-96ef902e6bb3.json
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: cloudflared-config
  namespace: trinity-dev
data:
  config.yml: |
    tunnel: e0a883c4-bc43-4742-b47a-96ef902e6bb3
    credentials-file: /etc/cloudflared/credentials.json
    
    ingress:
      - hostname: trinity.quantmatrixai.com
        service: http://trinity-ingress.trinity-dev.svc.cluster.local:80
      - service: http_status:404
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared
  namespace: trinity-dev
spec:
  replicas: 2  # High availability
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
            mountPath: /etc/cloudflared/config.yml
            subPath: config.yml
          - name: credentials
            mountPath: /etc/cloudflared/credentials.json
            subPath: credentials.json
      volumes:
        - name: config
          configMap:
            name: cloudflared-config
        - name: credentials
          secret:
            secretName: cloudflared-credentials
```

2. **Update Ingress to Use LoadBalancer or NodePort**

The Ingress needs to be accessible from the cloudflared pod. In k3s, Traefik is already running as the default Ingress controller.

3. **Deploy**
```bash
kubectl apply -f cloudflared-deployment.yaml
```

**Key change:** `service: http://trinity-ingress.trinity-dev.svc.cluster.local:80`
- This is the Kubernetes Service that exposes the Ingress controller
- Check with: `kubectl get svc -n kube-system traefik` (or similar)

---

### Solution 3: Kubernetes + Cloudflared in Docker with Host Network

**Best for:** Hybrid approach, during migration

**How it works:**
- Kubernetes services exposed on host network (NodePort or HostPort)
- Cloudflared in Docker connects to `localhost:<nodeport>`

**Steps:**

1. **Expose Ingress on Host**

k3s automatically exposes Traefik on ports 80/443 on the host.

2. **Update Cloudflared config**

Edit `cloudflared/tunnelCreds/config.yml`:
```yaml
tunnel: e0a883c4-bc43-4742-b47a-96ef902e6bb3
credentials-file: /etc/cloudflared/e0a883c4-bc43-4742-b47a-96ef902e6bb3.json

ingress:
  - hostname: trinity.quantmatrixai.com
    service: http://host.docker.internal:80  # ← Connect to host's port 80
  - service: http_status:404
```

3. **Update Docker Compose for Cloudflared**

Edit `cloudflared/docker-compose.yml`:
```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./tunnelCreds:/etc/cloudflared:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"  # ← Add this
```

4. **Start Cloudflared**
```bash
cd cloudflared
docker-compose up -d
```

**Limitation:** This works on Windows/Mac Docker Desktop. On Linux, use `network_mode: host` instead.

---

### Solution 4: Use `kubectl port-forward` + Cloudflared (Quick Test)

**Best for:** Testing, temporary setup

**Steps:**

1. **Expose Traefik Ingress**
```bash
kubectl port-forward -n kube-system service/traefik 80:80
```

2. **Update Cloudflared config**
```yaml
ingress:
  - hostname: trinity.quantmatrixai.com
    service: http://localhost:80
  - service: http_status:404
```

3. **Run Cloudflared locally** (not in Docker)
```bash
cloudflared tunnel --config cloudflared/tunnelCreds/config.yml run
```

**Limitation:** Port-forward must stay running. Not suitable for production.

---

## Recommended Path Forward

### For Development (Local Machine)

**Use Docker Compose** - It's simpler and Cloudflared already works.

```bash
# Stop Kubernetes
helm uninstall trinity -n trinity-dev

# Start Docker Compose
docker-compose up -d

# Start Cloudflared
cd cloudflared
docker-compose up -d
```

### For Production (Real Deployment)

**Use Kubernetes** - You get high availability, scaling, and fault tolerance.

**Choose ONE of these:**

1. **Deploy Cloudflared IN Kubernetes** (Solution 2) - Best for cloud production
2. **Use Cloudflare Load Balancer pointing to NodePort** - Best for on-premise

---

## Summary

### What's Happening

- You have both Docker Compose and Kubernetes configurations
- Cloudflared tunnel expects to connect to Docker's `trinity-net` network
- When you switch to Kubernetes, that network doesn't exist
- Services are now in a Kubernetes cluster network, unreachable by Docker containers

### What Broke

- Cloudflared can't find `traefik:80` (Docker service name)
- External domain `trinity.quantmatrixai.com` doesn't work
- You might see connection errors or 502 Bad Gateway

### How to Fix

**Short term (Development):** Use Docker Compose + Cloudflared Docker (already working)

**Long term (Production):** Deploy Cloudflared as a Kubernetes Pod OR use host network to bridge Docker and Kubernetes

---

## Quick Decision Matrix

| Scenario | Use | Why |
|----------|-----|-----|
| Local development, quick testing | Docker Compose | Simple, works out of box |
| Production, need HA | Kubernetes + Cloudflared in K8s | Best reliability |
| Migration phase | Kubernetes + Cloudflared Docker with host network | Bridge both worlds |
| Want to learn Kubernetes | Kubernetes with port-forward | Learn without breaking cloudflare |

---

## Next Steps

1. **Decide which mode you want:** Docker Compose OR Kubernetes
2. **Don't run both simultaneously** - causes port conflicts
3. **Follow the corresponding solution** from above
4. **Test locally first** before connecting Cloudflared
5. **Check the operations guide** (KUBERNETES-OPERATIONS-GUIDE.md) for day-to-day management

**Need help deciding?** 
- For learning/development: Stay with Docker Compose
- For production deployment: Go full Kubernetes with Cloudflared in K8s

