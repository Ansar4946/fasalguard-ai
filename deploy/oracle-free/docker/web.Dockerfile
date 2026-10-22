# Oracle-free kit: same as /Dockerfile.web plus a STORAGE_UPLOAD_ORIGINS build argument.
# next.config.ts evaluates headers() at `next build`, so the CSP connect-src origin must be known here.
# Build context: repository root (see deploy/oracle-free/docker-compose.yml).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
ARG STORAGE_UPLOAD_ORIGINS=""
ENV STORAGE_UPLOAD_ORIGINS=${STORAGE_UPLOAD_ORIGINS} NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=4096
COPY . .
RUN npx next build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
COPY licenses ./licenses
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
