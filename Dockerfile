# Production image for Railway.
# Serves the Vite build and the existing blocklist/policy API via `vite preview`.
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma

# Install all deps: vite (+ plugin) are used at runtime by configurePreviewServer.
RUN npm ci

COPY . .

# Prisma requires DATABASE_URL to exist while generating the client.
# Use a throwaway URL at build time only; Railway must set the real URL at runtime.
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
  npx prisma generate \
  && npm run build

ENV NODE_ENV=production

# Railway sets PORT. Local default matches Vite preview.
EXPOSE 4173

# Runtime DATABASE_URL must point at Railway Postgres (not localhost).
CMD ["sh", "-c", "npx prisma migrate deploy && npx vite preview --host 0.0.0.0 --port ${PORT:-4173}"]
