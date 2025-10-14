# Cloudflare Tunnel for Trinity Staging

This directory contains the Cloudflare Tunnel configuration for exposing Trinity staging environment to the internet at `trinity-stag.quantmatrixai.com`.

## Prerequisites

1. Cloudflare account with access to quantmatrixai.com domain
2. Cloudflare Tunnel created for staging environment
3. Trinity deployed in Kubernetes with Ingress enabled

## Setup Steps

### 1. Create Cloudflare Tunnel (One-time setup)

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create a new tunnel for staging
cloudflared tunnel create trinity-staging

# This generates a credentials file, save it to:
# ./tunnelCreds/<TUNNEL_ID>.json
```

### 2. Configure DNS in Cloudflare Dashboard

1. Go to Cloudflare Dashboard → Your domain (quantmatrixai.com)
2. DNS → Add record:
   - Type: CNAME
   - Name: trinity-stag
   - Target: `<TUNNEL_ID>.cfargotunnel.com`
   - Proxy status: Proxied (orange cloud)

### 3. Update Configuration

Edit `./tunnelCreds/config.yml`:
```yaml
tunnel: <YOUR_TUNNEL_ID>  # Replace with actual tunnel ID
credentials-file: /etc/cloudflared/<YOUR_TUNNEL_ID>.json  # Match filename
```

### 4. Expose Kubernetes Ingress

Before starting the tunnel, expose the NGINX Ingress controller:

```bash
# In a separate terminal (keep running)
kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 80:80 --address 127.0.0.1
```

### 5. Start Cloudflare Tunnel

```bash
cd cloudflared-stag
docker-compose up -d
```

### 6. Verify Connection

```bash
# Check tunnel status
docker-compose logs -f

# Test public access
curl https://trinity-stag.quantmatrixai.com
```

## Architecture

```
Internet → Cloudflare → Tunnel → localhost:80 → Ingress → Services → Pods

Path Routing (handled by Ingress):
  /admin      → Django Web (port 8000)
  /api        → FastAPI (port 8001)
  /trinityai  → Trinity AI (port 8002)
  /           → Frontend (port 80)
```

## Troubleshooting

**Tunnel won't start:**
- Check credentials file exists and matches config.yml
- Verify NGINX Ingress is running: `kubectl get pods -n ingress-nginx`
- Verify port 80 is forwarded: `netstat -an | findstr :80`

**Can't access domain:**
- Wait 2-3 minutes for DNS propagation
- Check Cloudflare Dashboard → Tunnels → Status (should be "Healthy")
- Test Ingress locally: `curl http://192.168.49.2` or `curl http://localhost`

**404 errors:**
- Verify Ingress is configured: `kubectl describe ingress -n trinity`
- Check service endpoints: `kubectl get endpoints -n trinity`

## Port Reference

| Service | Container Port | Ingress Path | Public URL |
|---------|----------------|--------------|------------|
| Frontend | 80 | / | trinity-stag.quantmatrixai.com/ |
| Django | 8000 | /admin | trinity-stag.quantmatrixai.com/admin |
| FastAPI | 8001 | /api | trinity-stag.quantmatrixai.com/api |
| Trinity-AI | 8002 | /trinityai | trinity-stag.quantmatrixai.com/trinityai |
| MinIO Console | 9001 | /minio-console | trinity-stag.quantmatrixai.com/minio-console |

