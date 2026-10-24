FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/app/.data
RUN groupadd --system --gid 1001 archive && useradd --system --uid 1001 --gid archive archive
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
RUN mkdir -p /app/.data/uploads && chown -R archive:archive /app/.data
COPY docker-entrypoint.sh /usr/local/bin/archive-entrypoint
RUN chmod +x /usr/local/bin/archive-entrypoint
EXPOSE 3000
VOLUME ["/app/.data"]
ENTRYPOINT ["archive-entrypoint"]
CMD ["npm", "start"]
