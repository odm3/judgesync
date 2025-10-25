# GitHub Secrets Configuration for JudgeSync

This document describes all GitHub Secrets required for automated deployment via GitHub Actions with OIDC authentication.

## Table of Contents

- [Required Secrets](#required-secrets)
- [Optional Secrets](#optional-secrets)
- [OIDC Setup Instructions](#oidc-setup-instructions)
- [How to Add Secrets to GitHub](#how-to-add-secrets-to-github)
- [How to Obtain Secret Values](#how-to-obtain-secret-values)
- [Troubleshooting](#troubleshooting)

---

## Required Secrets

These secrets **must** be configured for deployments to work.

### AWS Authentication (OIDC)

| Secret Name | Description | Example Value |
|------------|-------------|---------------|
| `AWS_ROLE_ARN` | IAM role ARN that GitHub Actions will assume via OIDC | `arn:aws:iam::123456789012:role/GitHubActionsRole` |
| `AWS_REGION` (or `AWS_DEFAULT_REGION`) | AWS region for deployments | `us-east-1` |

### Backend Secrets

| Secret Name | Description | How to Obtain |
|------------|-------------|---------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST API endpoint | From Upstash console → Redis → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST API token | From Upstash console → Redis → REST API |
| `UPSTASH_REDIS_URL` | Upstash Redis connection URL for Socket.IO | From Upstash console → Redis → Connection Info |

### Frontend Secrets

| Secret Name | Description | How to Obtain |
|------------|-------------|---------------|
| `VITE_SHARING_API` | Backend API URL | Get from backend CloudFormation outputs after first deploy |
| `VITE_ROBOTEVENTS_TOKEN` | RobotEvents API token | From https://www.robotevents.com/api/v2 |

---

## Optional Secrets

These secrets are **optional** and have sensible defaults if not provided.

### Backend Configuration

| Secret Name | Description | Default Value |
|------------|-------------|---------------|
| `LIGHTSAIL_SERVICE_NAME` | Lightsail container service name | `judgesync-backend` |
| `LIGHTSAIL_POWER` | Lightsail power tier (nano, micro, small, medium, large) | `micro` |
| `LIGHTSAIL_SCALE` | Number of container instances | `1` |

### Frontend Configuration

| Secret Name | Description | Default Value |
|------------|-------------|---------------|
| `SITE_DOMAIN_NAME` | Custom domain for frontend | `judgesync.example.com` (auto-generated CloudFront URL used) |
| `HOSTED_ZONE_ID` | Route 53 hosted zone ID for DNS | `''` (no DNS record created) |
| `S3_BUCKET_NAME` | Custom S3 bucket name | `''` (auto-generated with account ID + region) |

---

## OIDC Setup Instructions

GitHub Actions uses OpenID Connect (OIDC) to authenticate with AWS without storing long-lived access keys.

### Step 1: Create OIDC Provider in AWS

Run this command once in your AWS account:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

**Note:** You've already done this step since you mentioned the role is created.

### Step 2: Create IAM Role for GitHub Actions

Create an IAM role with this trust policy (replace `YOUR_ACCOUNT_ID` and `YOUR_GITHUB_ORG/REPO`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG/judgesync:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

### Step 3: Attach IAM Policies to Role

The role needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormation",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:GetTemplate"
      ],
      "Resource": [
        "arn:aws:cloudformation:*:*:stack/judgesync-backend/*",
        "arn:aws:cloudformation:*:*:stack/judgesync-frontend/*"
      ]
    },
    {
      "Sid": "Lightsail",
      "Effect": "Allow",
      "Action": [
        "lightsail:CreateContainerService",
        "lightsail:UpdateContainerService",
        "lightsail:GetContainerServices",
        "lightsail:CreateContainerServiceDeployment",
        "lightsail:PushContainerImage"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:PutBucketPolicy",
        "s3:PutBucketVersioning",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::judgesync-*",
        "arn:aws:s3:::judgesync-*/*"
      ]
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:CreateInvalidation",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:GetOriginAccessControl"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ACM",
      "Effect": "Allow",
      "Action": [
        "acm:RequestCertificate",
        "acm:DescribeCertificate",
        "acm:AddTagsToCertificate"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Route53",
      "Effect": "Allow",
      "Action": [
        "route53:ChangeResourceRecordSets",
        "route53:GetChange",
        "route53:ListHostedZones"
      ],
      "Resource": "*"
    }
  ]
}
```

### Step 4: Get Role ARN

After creating the role, get its ARN:

```bash
aws iam get-role --role-name GitHubActionsRole --query 'Role.Arn' --output text
```

Copy this value to the `AWS_ROLE_ARN` GitHub Secret.

---

## How to Add Secrets to GitHub

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Enter the **Name** and **Value**
5. Click **Add secret**

Repeat for each required secret.

---

## How to Obtain Secret Values

### AWS_ROLE_ARN

Get the IAM role ARN you created for GitHub Actions:

```bash
aws iam get-role \
  --role-name GitHubActionsRole \
  --query 'Role.Arn' \
  --output text
```

**Example output:**
```
arn:aws:iam::123456789012:role/GitHubActionsRole
```

### AWS_REGION (or AWS_DEFAULT_REGION)

Choose the AWS region closest to your users. Recommended: `us-east-1` (required for CloudFront ACM certificates).

**Note:** The workflows accept either `AWS_REGION` or `AWS_DEFAULT_REGION` - use whichever you prefer.

**Value:**
```
us-east-1
```

### UPSTASH_REDIS_REST_URL

1. Go to [Upstash Console](https://console.upstash.com/)
2. Select your Redis instance
3. Go to **REST API** tab
4. Copy the **UPSTASH_REDIS_REST_URL**

**Example format:**
```
https://amazing-shark-12345.upstash.io
```

### UPSTASH_REDIS_REST_TOKEN

Same location as above, copy the **UPSTASH_REDIS_REST_TOKEN**.

**Example format:**
```
AYQgASQgOTk5OTk5OTktOTk5OS05OTk5LTk5OTktOTk5OTk5OTk5OTk5fDEyMzQ1Njc4OTAx...
```

### UPSTASH_REDIS_URL

1. In Upstash Console, go to your Redis instance
2. Click **Connect** or **Details**
3. Copy the **TLS (Redis) URL**

**Example format:**
```
rediss://default:abc123xyz@amazing-shark-12345.upstash.io:6379
```

### VITE_SHARING_API

**On first deployment:**

This value comes from the backend CloudFormation stack outputs. Since the backend doesn't exist yet, you can:

**Option 1:** Deploy backend first, then add this secret:
1. Push backend code (workflow will fail at frontend build)
2. Get backend URL from CloudFormation outputs:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name judgesync-backend \
     --query 'Stacks[0].Outputs[?OutputKey==`ContainerServiceUrl`].OutputValue' \
     --output text
   ```
3. Add to GitHub Secrets
4. Re-run frontend deployment

**Option 2:** Use a placeholder initially:
```
https://placeholder.local
```
Then update after backend deploys.

**Example format:**
```
https://judgesync-backend.xxxxx.us-east-1.cs.amazonlightsail.com
```

### VITE_ROBOTEVENTS_TOKEN

1. Go to https://www.robotevents.com/api/v2
2. Sign in to your RobotEvents account
3. Generate an API token
4. Copy the token

**Example format:**
```
eyJ0eXAiOiJKV1QiLCJhbGc...
```

---

## Secrets Summary Table

| Secret | Required? | Where Used | Default |
|--------|-----------|------------|---------|
| `AWS_ROLE_ARN` | ✅ Yes | Both workflows | N/A |
| `AWS_REGION` (or `AWS_DEFAULT_REGION`) | ✅ Yes | Both workflows | N/A |
| `UPSTASH_REDIS_REST_URL` | ✅ Yes | Backend deployment | N/A |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ Yes | Backend deployment | N/A |
| `UPSTASH_REDIS_URL` | ✅ Yes | Backend deployment | N/A |
| `VITE_SHARING_API` | ✅ Yes | Frontend build | N/A |
| `VITE_ROBOTEVENTS_TOKEN` | ✅ Yes | Frontend build | N/A |
| `LIGHTSAIL_SERVICE_NAME` | ❌ No | Backend deployment | `judgesync-backend` |
| `LIGHTSAIL_POWER` | ❌ No | Backend deployment | `micro` |
| `LIGHTSAIL_SCALE` | ❌ No | Backend deployment | `1` |
| `SITE_DOMAIN_NAME` | ❌ No | Frontend deployment | Auto-generated |
| `HOSTED_ZONE_ID` | ❌ No | Frontend deployment | None |
| `S3_BUCKET_NAME` | ❌ No | Frontend deployment | Auto-generated |

---

## Removed Secrets (No Longer Needed)

If you previously configured these, you can **delete them**:

- ❌ `AWS_ACCESS_KEY_ID` (replaced by OIDC)
- ❌ `AWS_SECRET_ACCESS_KEY` (replaced by OIDC)
- ❌ `AWS_S3_BUCKET` (extracted from CloudFormation)
- ❌ `AWS_CLOUDFRONT_DISTRIBUTION_ID` (extracted from CloudFormation)
- ❌ `LIGHTSAIL_CONTAINER_PORT` (hardcoded to 8787)

---

## Troubleshooting

### Error: "User: arn:aws:sts::... is not authorized to perform: sts:AssumeRoleWithWebIdentity"

**Cause:** OIDC trust policy doesn't match your repository.

**Fix:** Update the IAM role trust policy with your correct GitHub organization and repository name:
```json
"token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/judgesync:ref:refs/heads/main"
```

### Error: "Container service 'judgesync-backend' not found"

**Cause:** This should not happen with the new workflows - they create the service automatically.

**Fix:** The CloudFormation stack deployment step should handle this. Check CloudFormation console for errors.

### Error: "Backend is not available" when building frontend

**Cause:** `VITE_SHARING_API` points to a non-existent or unreachable backend.

**Fix:**
1. Deploy backend first
2. Get backend URL from CloudFormation outputs
3. Update `VITE_SHARING_API` secret
4. Re-run frontend workflow

### Error: "Certificate pending validation"

**Cause:** ACM certificate requires DNS validation for custom domains.

**Fix:** The frontend workflow will show validation records. Add them to your DNS:
1. Check workflow logs for validation records
2. Add CNAME record to your domain's DNS
3. Wait 5-30 minutes for validation
4. Re-run deployment

### Backend deployment succeeds but app crashes

**Cause:** Missing or incorrect Upstash Redis credentials.

**Fix:** Verify all three Redis secrets are correct:
```bash
# Test Redis connection locally
redis-cli -u $UPSTASH_REDIS_URL ping
```

---

## Cost Estimation

With the configured defaults:

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| Lightsail (micro) | 0.25 vCPU, 1GB RAM | **$10** |
| Upstash Redis | Free tier | **$0** (if <10K commands/day) |
| S3 + CloudFront | 5GB storage, 50GB transfer | **~$5** |
| **Total** | | **~$15/month** |

To reduce costs:
- Set `LIGHTSAIL_POWER=nano` for $7/month instead of $10
- Stay within Upstash free tier (10,000 commands/day)
- Use auto-generated CloudFront URL (avoid Route 53 hosted zone cost)

---

## Next Steps

1. ✅ Create GitHub OIDC IAM role in AWS
2. ✅ Create Upstash Redis instance
3. ✅ Get RobotEvents API token
4. ✅ Add all required secrets to GitHub
5. ✅ Push code to `main` branch
6. ✅ Monitor GitHub Actions workflows
7. ✅ Update `VITE_SHARING_API` after backend deploys
8. ✅ Validate ACM certificate if using custom domain

For questions or issues, check the [GitHub Actions logs](../../actions) or review the workflow files:
- [Backend Deployment](.github/workflows/deploy-backend.yml)
- [Frontend Deployment](.github/workflows/deploy-frontend.yml)
