# Deploying the Backend to AWS Lightsail (Containers)

This guide describes the resources and automation already in the repo for running the Socket.IO backend on a Lightsail container service and redeploying automatically via GitHub Actions.

## 1. Provision infrastructure with CloudFormation

Deploy the stack (per region) defined in `infra/cloudformation/backend-stack.yml`. Run this command in the AWS CLI (use the region where you want the service to live):

```bash
aws cloudformation deploy \
  --region us-east-1 \
  --template-file infra/cloudformation/backend-stack.yml \
  --stack-name judgesync-backend \
  --parameter-overrides \
      ContainerServiceName=judgesync-backend \
      Power=medium \
      Scale=1 \
      HealthCheckPath=/health \
      ContainerPort=8787
```

The stack creates:

- A Lightsail container service named `judgesync-backend`.  
- A public endpoint pointing at the `backend` container on port `8787`, with health checks on `/health`.

Use the outputs:

- `ContainerServiceName` → pass to deployments.  
- `ContainerServiceUrl` → default public URL (you can point Route 53/CNAME records to this or attach a custom domain through the Lightsail console).

> If you need multiple regions for failover, deploy the same template in each region with unique service names (e.g., `judgesync-backend-use1`, `judgesync-backend-usw2`).

## 2. Secrets required by the backend

Add the runtime secrets to GitHub (Settings → Secrets and Variables → Actions). For Upstash Redis, set:

| Secret | Value |
|--------|-------|
| `UPSTASH_REDIS_REST_URL` | REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | API token |
| `UPSTASH_REDIS_URL` | Standard Redis or WebSocket URL (e.g., `rediss://` or `wss://`) |
| `LIGHTSAIL_SERVICE_NAME` | Lightsail container service name (e.g., `judgesync-backend`) |
| `LIGHTSAIL_CONTAINER_PORT` | `8787` (optional; defaults to 8787) |
| `SESSION_TTL_SECONDS` | Optional override for session retention (default 604800 = 7 days) |

The existing AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`) are reused by both frontend and backend workflows.

## 3. GitHub Actions deployment

The workflow `.github/workflows/deploy-backend.yml` fires on pushes to `main` that touch `backend/**`. It performs:

1. Builds the backend Docker image using `backend/Dockerfile`.  
2. Pushes the image to the Lightsail container service with `aws lightsail push-container-image`.  
3. Deploys it immediately with `aws lightsail create-container-service-deployment`, injecting runtime env vars (`PORT`, `NODE_ENV`, Upstash secrets).

No manual steps are required after the stack exists and secrets are configured. You can monitor deployments via `aws lightsail get-container-service-deployments --service-name judgesync-backend`.

## 4. Custom domain and TLS

Lightsail container services provide a default HTTPS URL. For a custom domain:

1. Create a CNAME (`api.example.com`) pointing to the `ContainerServiceUrl`.  
2. Optionally, use the Lightsail console to request a managed certificate and attach it to the service, or front it with a CloudFront distribution / Route 53 failover.

## 5. Multi-region & failover (optional)

Repeat the stack in another region, deploy via the same workflow (set `LIGHTSAIL_SERVICE_NAME` to the regional name), and use Route 53 latency or failover routing to spread traffic. Upstash Redis’ global endpoint can serve both regions.
