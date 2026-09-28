# syntax=docker/dockerfile:1

# ---- Build: client bundle + server bundle + migration runner ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- Runtime: production dependencies only, non-root ----
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=5000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations are normally run as a separate release step (`node dist/migrate.js`).
# Set RUN_MIGRATIONS=true to run them on start instead (safe with several replicas: advisory lock).
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" = \"true\" ]; then node dist/migrate.js || exit 1; fi; exec node dist/index.js"]
