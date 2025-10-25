# syntax=docker/dockerfile:1.6

##
# 1. Install only production dependencies
##
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

##
# 2. Build the TypeScript source
##
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

##
# 3. Runtime image
##
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY --from=builder /app/dist ./dist

EXPOSE 8787
CMD ["node", "dist/server.js"]
