# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl
COPY package*.json ./
RUN npm install -g npm@11
RUN npm ci
COPY prisma ./prisma/
# 1. Accept the arguments from Fly/GitHub Actions
ARG APP_VERSION
ARG APP_LASTMOD
# 2. Convert ARGs to ENVs so Vite can read them via process.env
ENV APP_VERSION=$APP_VERSION
ENV APP_LASTMOD=$APP_LASTMOD
RUN npx prisma generate
COPY . .
# Mount the Sentry auth token as a build secret
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    SENTRY_AUTH_TOKEN=$(cat /run/secrets/SENTRY_AUTH_TOKEN) npm run build

# Stage 2: Run
FROM node:20-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl

# Copy only what is needed for production
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma/

# Install only production dependencies
RUN npm install -g npm@11
RUN npm ci --omit=dev
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "build"]