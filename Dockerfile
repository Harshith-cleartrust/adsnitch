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

RUN npx prisma generate \
  && npm run build

ENV NODE_ENV=production

# Railway sets PORT. Local default matches Vite preview.
EXPOSE 4173

CMD ["sh", "-c", "npx prisma migrate deploy && npx vite preview --host 0.0.0.0 --port ${PORT:-4173}"]
