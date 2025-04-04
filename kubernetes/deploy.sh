#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}VoiceScribe Kubernetes Deployment${NC}"
echo "This script will deploy VoiceScribe to your Kubernetes cluster."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "kubectl is not installed. Please install kubectl first."
    exit 1
fi

# Check if connected to a Kubernetes cluster
echo "Checking connection to Kubernetes cluster..."
if ! kubectl cluster-info &> /dev/null; then
    echo "Failed to connect to Kubernetes cluster. Please check your kubeconfig."
    exit 1
fi

# Create namespace if it doesn't exist
echo "Creating 'voicescribe' namespace if it doesn't exist..."
kubectl create namespace voicescribe --dry-run=client -o yaml | kubectl apply -f -

# Prompt for Groq API key
echo -e "${YELLOW}Please enter your Groq API key:${NC}"
read -s groq_api_key

# Create base64 encoded secret
encoded_key=$(echo -n "$groq_api_key" | base64)

# Update secret in service.yaml
echo "Updating API key in secret configuration..."
sed -i "s/groq-api-key: .*/groq-api-key: $encoded_key/" service.yaml

# Build Docker images (assuming Docker is running and Dockerfiles exist)
echo "Building Docker images..."
cd ..
docker build -t voicescribe-api:latest ./server
docker build -t voicescribe-web:latest .

# Apply Kubernetes configurations
echo "Applying Kubernetes configurations..."
cd kubernetes
kubectl apply -f service.yaml -n voicescribe
kubectl apply -f deployment.yaml -n voicescribe
kubectl apply -f hpa.yaml -n voicescribe

# Wait for deployments to be ready
echo "Waiting for deployments to be ready..."
kubectl rollout status deployment/voicescribe-api -n voicescribe
kubectl rollout status deployment/voicescribe-web -n voicescribe
kubectl rollout status deployment/voicescribe-redis -n voicescribe

# Get the external IP or URL
echo "Getting service information..."
web_service_ip=$(kubectl get service voicescribe-web -n voicescribe -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

if [ -z "$web_service_ip" ]; then
    web_service_hostname=$(kubectl get service voicescribe-web -n voicescribe -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    if [ -n "$web_service_hostname" ]; then
        echo -e "${GREEN}VoiceScribe is now available at: http://$web_service_hostname${NC}"
    else
        echo -e "${YELLOW}LoadBalancer is still pending. Run the following command to get the IP later:${NC}"
        echo "kubectl get service voicescribe-web -n voicescribe"
    fi
else
    echo -e "${GREEN}VoiceScribe is now available at: http://$web_service_ip${NC}"
fi

echo -e "${GREEN}Deployment complete!${NC}" 