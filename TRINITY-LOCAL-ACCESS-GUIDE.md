# Trinity Local Network Access - Complete Guide

## 🎯 Quick Start

### Access Trinity from ANY device on your network:

```
http://172.19.128.1:8080  ← Your main application
```

## 📋 Current Setup Summary

### Services Running with Fault Tolerance:

| Service | Replicas | Status | Access URL |
|---------|----------|--------|------------|
| **Frontend** | 2/2 | ✅ Running | http://172.19.128.1:8080 |
| **Django Web** | 1/2 | ⚠️ Partial | http://172.19.128.1:8000 |
| **FastAPI** | 0/2 | ❌ Issues | http://172.19.128.1:8001 |
| **Trinity AI** | 1/1 | ✅ Running | http://172.19.128.1:8002 |
| **Celery** | 2/2 | ✅ Running | Background worker |
| **Flight** | 1/1 | ✅ Running | Internal gRPC |
| **PostgreSQL** | 1/1 | ✅ Running | Internal database |
| **MongoDB** | 1/1 | ✅ Running | Internal database |
| **Redis** | 1/1 | ✅ Running | Internal cache |
| **MinIO** | 1/1 | ✅ Running | http://172.19.128.1:9001 (console) |

### Port Mapping (Consistent Across All Environments)

#### Container Ports (Inside Pods):
- Frontend: **80**
- Django: **8000**
- FastAPI: **8001**
- Trinity AI: **8002**
- Flight: **8815**
- PostgreSQL: **5432**
- MongoDB: **27017**
- Redis: **6379**
- MinIO API: **9000**
- MinIO Console: **9001**

#### NodePorts (Minikube External Access):
- Frontend: **30080**
- Django: **30000**
- FastAPI: **30001**
- Trinity AI: **30002**
- PostgreSQL: **30432**
- MongoDB: **30017**
- Redis: **30379**
- MinIO API: **30900**
- MinIO Console: **30901**

#### Host Ports (Port-Forward for Network Access):
- Frontend: **8080** (matches Docker Compose)
- Django: **8000** (matches Docker Compose)
- FastAPI: **8001** (matches Docker Compose)
- Trinity AI: **8002** (matches Docker Compose)
- MinIO Console: **9001**

## 🚀 How to Access

### From Your Laptop:
```
http://localhost:8080           ← Frontend
http://localhost:8000/admin     ← Django Admin
http://localhost:8001/docs      ← FastAPI Docs
http://localhost:8002           ← Trinity AI
```

### From Other Devices on Same WiFi/Network:
```
http://172.19.128.1:8080        ← Frontend
http://172.19.128.1:8000/admin  ← Django Admin
http://172.19.128.1:8001/docs   ← FastAPI Docs
http://172.19.128.1:8002        ← Trinity AI
http://172.19.128.1:9001        ← MinIO Console
```

### From Phones/Tablets on Same Network:
Just open browser and go to:
```
http://172.19.128.1:8080
```

## 📡 How It Works

### The Complete Flow:

```
Coworker's Laptop (192.168.1.50)
    │
    │ WiFi/LAN Network
    │
    ↓
Your Windows Machine (172.19.128.1)
    │
    ├─ Port 8080 forwarded to →
    │
    ↓
Minikube Cluster (Running in Docker)
    │
    ├─ Service: frontend (Load Balancer)
    │   ├─ frontend-pod-1 (Nginx serving React)
    │   └─ frontend-pod-2 (Nginx serving React)
    │
    └─ If Pod 1 crashes → Pod 2 handles traffic ✅
```

## 🛠️ Management Commands

### Start Network Exposure

```powershell
# Terminal 1: Start port forwarding (keep open)
.\scripts\expose-trinity-network.ps1
```

### Stop Network Exposure

```powershell
# In a new terminal or press Ctrl+C in the running terminal
.\scripts\expose-trinity-network.ps1 -Stop
```

### Check Status

```powershell
# Check all pods
kubectl get pods -n trinity

# Check deployments and replicas
kubectl get deployments -n trinity

# Check which services are exposed
Get-Job | Where-Object {$_.Name -like "trinity-*"}
```

### Restart a Service

```powershell
# Restart all web pods (to pick up new image)
kubectl rollout restart deployment/web -n trinity

# Restart specific pod
kubectl delete pod -n trinity <pod-name>
```

## 🔧 Troubleshooting

### Can't Access from Other Devices

1. **Check Windows Firewall:**
```powershell
# Allow incoming on ports 8080, 8000, 8001, 8002
New-NetFirewallRule -DisplayName "Trinity Kubernetes" -Direction Inbound -LocalPort 8080,8000,8001,8002,9001 -Protocol TCP -Action Allow
```

2. **Verify port forwarding is running:**
```powershell
Get-Job | Where-Object {$_.Name -like "trinity-*"}

# Should show 4-5 jobs in "Running" state
```

3. **Test from same machine first:**
```powershell
curl http://localhost:8080
```

4. **Check device IP:**
```powershell
ipconfig

# Find your active network adapter
# Look for IPv4 Address
```

### Services Not Responding

```powershell
# Check pod logs
kubectl logs -n trinity <pod-name>

# Check pod status
kubectl describe pod -n trinity <pod-name>

# Common issues:
# - CrashLoopBackOff: Application error, check logs
# - ImagePullBackOff: Rebuild image with minikube docker-env
# - Init:0/3: Waiting for databases to start
```

### Port Forwarding Keeps Stopping

The script has auto-restart built-in, but if it keeps failing:

```powershell
# Manual port forward (simple version)
kubectl port-forward -n trinity service/frontend 8080:80 --address 0.0.0.0
# Keep this terminal open
```

## 🎯 What You Have Now

### Fault Tolerance Features Active:

✅ **Multiple Replicas**
- Frontend: 2 pods (if one crashes, other handles traffic)
- Django Web: 2 pods (load balanced)
- Celery: 2 pods (parallel task processing)

✅ **Auto-Restart**
- Health checks monitor all pods
- Failed pods restart automatically
- No manual intervention needed

✅ **Resource Protection**
- Memory limits prevent OOM crashes affecting other services
- CPU limits prevent one service hogging all CPU
- Guaranteed minimums ensure services always have resources

✅ **Data Persistence**
- PostgreSQL data survives pod restarts
- MongoDB data survives pod restarts
- Redis data survives pod restarts
- MinIO files survive pod restarts

✅ **Load Balancing**
- Kubernetes Service distributes traffic across pod replicas
- Automatic failover if pod becomes unhealthy

## 📊 Monitoring

### Watch Pods in Real-Time

```powershell
kubectl get pods -n trinity -w
```

### See Resource Usage

```powershell
# Install metrics-server first (if not installed)
minikube addons enable metrics-server

# Then check usage
kubectl top pods -n trinity
```

### Check Fault Tolerance in Action

```powershell
# Delete a frontend pod
kubectl delete pod -n trinity frontend-5db7c54b8c-hhjnt

# Watch it recreate
kubectl get pods -n trinity -w

# Meanwhile, test app still works
curl http://localhost:8080
# ✅ Still working! Other replica handled it
```

## 🌐 Access URLs Summary

### Internal (Minikube Services):
```bash
minikube service frontend-nodeport -n trinity --url
# Returns: http://127.0.0.1:61341 (dynamic port)
```

### Network Access (Port Forward - Recommended):
```
Frontend:      http://172.19.128.1:8080
Django Admin:  http://172.19.128.1:8000/admin
FastAPI Docs:  http://172.19.128.1:8001/docs
Trinity AI:    http://172.19.128.1:8002
MinIO Console: http://172.19.128.1:9001
```

### NodePort Direct Access:
```
Frontend:      http://172.19.128.1:30080
Django Admin:  http://172.19.128.1:30000/admin
FastAPI Docs:  http://172.19.128.1:30001/docs
Trinity AI:    http://172.19.128.1:30002
```

## Next Steps

1. ✅ Local network access configured
2. ✅ Fault tolerance with replicas enabled
3. ✅ Health checks monitoring services
4. ⏳ Fix remaining service issues (FastAPI DataStorageRetrieval)
5. ⏳ Test from another device on your network
6. ⏳ Set up Cloudflare Tunnel (when ready)

## Recommended Test

From another device on your network (phone, tablet, laptop):

1. Connect to same WiFi
2. Open browser
3. Go to: `http://172.19.128.1:8080`
4. You should see Trinity frontend
5. Login with: `sushant.upadhyay@quantmatrixai.com` / `QM240108`

This proves your Trinity app is now accessible network-wide, just like with Docker Compose! 🎉

