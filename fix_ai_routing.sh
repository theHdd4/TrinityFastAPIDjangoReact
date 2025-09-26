#!/bin/bash

# Trinity AI Routing Fix Script
# This script rebuilds and restarts the services with the correct configuration

echo "🔧 Trinity AI Routing Fix Script"
echo "================================="

# Set the HOST_IP environment variable
export HOST_IP=${HOST_IP:-10.2.2.131}
export OLLAMA_IP=${OLLAMA_IP:-10.2.4.48}

echo "📍 Using HOST_IP: $HOST_IP"
echo "📍 Using OLLAMA_IP: $OLLAMA_IP"

# Stop existing services
echo "🛑 Stopping existing services..."
docker-compose down

# Rebuild frontend with correct environment variables
echo "🔨 Rebuilding frontend with correct API configuration..."
docker-compose build --no-cache frontend

# Rebuild Trinity AI service
echo "🔨 Rebuilding Trinity AI service..."
docker-compose build --no-cache trinity-ai

# Start services
echo "🚀 Starting services with correct configuration..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service status
echo "📊 Checking service status..."
docker-compose ps

# Test the AI endpoints
echo "🧪 Testing AI endpoints..."
echo "Testing merge endpoint:"
curl -X POST "http://$HOST_IP:8002/trinityai/merge" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test merge", "session_id": "test123"}' \
  --connect-timeout 10 || echo "❌ Merge endpoint test failed"

echo ""
echo "Testing concat endpoint:"
curl -X POST "http://$HOST_IP:8002/trinityai/concat" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test concat", "session_id": "test123"}' \
  --connect-timeout 10 || echo "❌ Concat endpoint test failed"

echo ""
echo "✅ Fix applied! The 405 Method Not Allowed errors should now be resolved."
echo "🌐 Frontend should now correctly call:"
echo "   - http://$HOST_IP:8002/trinityai/merge"
echo "   - http://$HOST_IP:8002/trinityai/concat"
echo "   - http://$HOST_IP:8002/trinityai/create-transform"
echo "   - http://$HOST_IP:8002/trinityai/groupby"
echo "   - http://$HOST_IP:8002/trinityai/chart-maker"
echo "   - http://$HOST_IP:8002/trinityai/explore"
