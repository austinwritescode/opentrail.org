# Stage 1: Build Stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
# 'npm ci' is better than 'npm install' for CI/CD as it's faster and cleaner
RUN npm ci 
COPY . .
RUN npm run build

# Stage 2: Run Stage
FROM node:20-slim
WORKDIR /app
# We only copy the built assets and the production-ready node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
# Only install production dependencies to keep the image light
RUN npm ci --omit=dev 
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "build"]