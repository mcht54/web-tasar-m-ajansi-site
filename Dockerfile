# Üretim imajı (Next.js standalone çıktısı).
# Derleme sırasında ana sayfa ve sitemap ön-render edildiği için DATABASE_URL
# build aşamasında da erişilebilir olmalıdır (docker build --build-arg ile verin).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG DATABASE_URL
ARG SITE_URL
ARG APP_SECRET
ENV DATABASE_URL=$DATABASE_URL SITE_URL=$SITE_URL APP_SECRET=$APP_SECRET NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3300 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN useradd -r -u 1001 app && mkdir -p /app/storage/media && chown -R app /app/storage
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
# ISR/önbellek yazımı: uygulama kullanıcısı .next altına yazabilmeli (aksi hâlde EACCES)
RUN mkdir -p /app/.next/cache && chown -R app:app /app/.next
USER app
EXPOSE 3300
# SEO ajanı zamanlayıcısı + worker bu süreçte çalışır (instrumentation → /api/internal/tick).
# Harici cron/worker kullanılacaksa: -e AUTOPILOT_SCHEDULER=off
CMD ["node", "server.js"]
