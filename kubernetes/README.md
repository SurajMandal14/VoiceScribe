# Kubernetes Deployment for VoiceScribe

This directory contains Kubernetes configuration files for deploying VoiceScribe to a Kubernetes cluster. This setup is recommended for scenarios with 500+ concurrent users.

## Files

- `deployment.yaml` - Deployment configurations for API, web, and Redis
- `service.yaml` - Service and Secret configurations
- `hpa.yaml` - Horizontal Pod Autoscaler configurations
- `deploy.sh` - Helper script for quick deployment

## Quick Deployment

The easiest way to deploy is to use the provided script:

```bash
chmod +x deploy.sh
./deploy.sh
```

The script will:

1. Check if kubectl is installed and connected
2. Create a namespace
3. Prompt for your Groq API key
4. Build the Docker images
5. Apply the Kubernetes configurations
6. Wait for deployments to be ready
7. Display the URL where VoiceScribe is available

## Manual Deployment

If you prefer to deploy manually:

1. Create a namespace:

   ```bash
   kubectl create namespace voicescribe
   ```

2. Create a secret with your Groq API key:

   ```bash
   kubectl create secret generic voicescribe-secrets \
     --from-literal=groq-api-key=YOUR_GROQ_API_KEY \
     --namespace voicescribe
   ```

3. Build the Docker images:

   ```bash
   # From the project root
   docker build -t voicescribe-api:latest ./server
   docker build -t voicescribe-web:latest .
   ```

4. Apply the Kubernetes configurations:

   ```bash
   kubectl apply -f deployment.yaml -n voicescribe
   kubectl apply -f service.yaml -n voicescribe
   kubectl apply -f hpa.yaml -n voicescribe
   ```

5. Check the deployment status:
   ```bash
   kubectl get pods -n voicescribe
   kubectl get services -n voicescribe
   ```

## Configuration

### Scaling

The default configuration provides:

- 3-10 API pods (scales based on CPU/memory usage)
- 2-5 web pods (scales based on CPU usage)
- 1 Redis pod (not scaled automatically)

To adjust these values, modify the `minReplicas` and `maxReplicas` in the `hpa.yaml` file.

### Resource Allocation

Each component has defined resource requests and limits. For higher traffic:

1. Increase the resource limits in `deployment.yaml`
2. Adjust the number of Uvicorn workers in the API deployment's `WORKERS` environment variable

## Cloud Provider Specific Notes

### AWS EKS

For AWS EKS, you may want to use an Application Load Balancer:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: voicescribe-web
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "alb"
    service.beta.kubernetes.io/aws-load-balancer-ssl-cert: "your-cert-arn"
    service.beta.kubernetes.io/aws-load-balancer-ssl-ports: "https"
spec:
  type: LoadBalancer
  ports:
    - port: 443
      targetPort: 80
      protocol: TCP
      name: https
  selector:
    app: voicescribe
    tier: frontend
```

### Google GKE

For GKE, consider using a managed Redis instance instead of the containerized one:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: voicescribe-redis
  annotations:
    cloud.google.com/neg: '{"ingress": true}'
spec:
  type: ExternalName
  externalName: your-redis-instance.region.c.project.internal
```

## Monitoring

Add Prometheus monitoring by deploying the Prometheus Operator:

```bash
kubectl apply -f https://github.com/prometheus-operator/kube-prometheus/tree/main/manifests/setup
kubectl apply -f https://github.com/prometheus-operator/kube-prometheus/tree/main/manifests
```

Then create a ServiceMonitor for VoiceScribe API.
