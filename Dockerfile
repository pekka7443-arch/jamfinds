FROM node:22-slim AS deps
WORKDIR /app
RUN npm install -g bun@1.2
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM node:22-slim AS builder
WORKDIR /app
RUN npm install -g bun@1.2
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
# Build with node (Next.js 16 Turbopack requires Node worker_threads)
RUN npx next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/

FROM oven/bun:1.2-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

RUN mkdir -p /data

EXPOSE 3000
ENV PORT=3000
ENV DATABASE_URL=file:/data/custom.db

CMD ["sh", "-c", "bunx prisma db push --accept-data-loss && bun server.js"]
