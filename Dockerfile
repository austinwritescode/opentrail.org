# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma/
RUN npx prisma generate
COPY . .
RUN npm run build

# Stage 2: Run
FROM node:20-slim
WORKDIR /app

# Install openssl (Required for Prisma engines on slim images)
RUN apt-get update -y && apt-get install -y openssl

# Copy only what is needed for production
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev
RUN ./node_modules/.bin/prisma generate

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "build"]