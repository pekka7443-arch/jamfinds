FROM oven/bun:1.2-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM oven/bun:1.2-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Data dir for SQLite volume mount
RUN mkdir -p /data

EXPOSE 3000
ENV PORT=3000
ENV DATABASE_URL=file:/data/custom.db

CMD ["sh", "-c", "bunx prisma db push --accept-data-loss && bun server.js"]
