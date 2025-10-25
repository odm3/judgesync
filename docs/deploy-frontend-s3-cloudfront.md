# Deploying the Frontend to AWS S3 + CloudFront

These steps publish the Vite build (`frontend/dist/frontend`) to an S3 bucket and then invalidate the CloudFront cache so users see the new assets immediately.

## Prerequisites

1. **AWS CLI** installed and authenticated (`aws configure`).
2. **S3 bucket** created to host the static site (e.g. `my-judgesync-frontend`).
3. **CloudFront distribution** pointing to that bucket (note the distribution ID).
4. Node dependencies installed (`npm install` in `/frontend`).

## Environment Variables

Export these before running the deploy script, or add them to your shell profile/secrets:

```bash
export AWS_S3_BUCKET=my-judgesync-frontend
export AWS_CLOUDFRONT_DISTRIBUTION_ID=E1234567890ABC
```

If your build needs to target the production backend, also set:

```bash
export VITE_SHARING_API=https://api.my-domain.com
```

You can place these in a `.env.production` file and load it with your shell, or configure them in your CI/CD system.

## One-Time Bucket Settings

On the S3 bucket:

- Enable **static website hosting** or allow CloudFront’s OAI to read objects.
- Set a bucket policy that allows the CloudFront origin access identity (OAI) to `s3:GetObject`.
- Optionally configure default root object (`index.html`) in CloudFront for SPA routing.

## Deploy Command

From the repository root (or inside `frontend/`), run:

```bash
cd frontend
npm run deploy:s3
```

The script performs:

1. `npm run build` – compiles the Vite project into `dist/frontend`.
2. `aws s3 sync dist/frontend s3://$AWS_S3_BUCKET --delete` – uploads new files and removes orphaned ones.
3. `aws cloudfront create-invalidation --distribution-id $AWS_CLOUDFRONT_DISTRIBUTION_ID --paths '/*'` – flushes the CDN cache.

Deployment completes a few seconds after the invalidation propagates.

## SPA Rewrite (Optional)

If you rely on client-side routing, configure CloudFront behavior or S3 website hosting to return `index.html` for unknown paths. One approach is to add a Lambda@Edge or CloudFront Function that maps `404` responses to `index.html`. Alternatively, store the app in a bucket configured for static website hosting and point CloudFront to the website endpoint with a custom error response (`404` → `/index.html`).

## Automating in CI

These same commands can be run from GitHub Actions or another CI pipeline. Ensure the CI environment sets the AWS credentials and the two environment variables above. A minimal GitHub Actions job:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
        working-directory: frontend
      - run: npm run deploy:s3
        working-directory: frontend
        env:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_CLOUDFRONT_DISTRIBUTION_ID: ${{ secrets.AWS_CLOUDFRONT_DISTRIBUTION_ID }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: us-east-1
```

That’s all that’s required to ship the frontend through S3 and CloudFront. !*** End Patch
