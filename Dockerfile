# ─── Etapa 0: versión desde git (1.0.<nº commits> + hash) ───
FROM alpine/git AS gitinfo
WORKDIR /repo
COPY .git ./.git
RUN echo "1.0.$(git rev-list --count HEAD) ($(git rev-parse --short HEAD))" > /appversion \
  || echo "1.0.docker" > /appversion

# ─── Etapa 1: construir la web (Vite) ───
FROM node:20-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ─── Etapa 2: dependencias de producción del backend ───
FROM node:20-alpine AS deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# ─── Etapa 3: imagen final ───
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# Backend + sus dependencias de producción
COPY backend/ ./backend/
COPY --from=deps /app/backend/node_modules ./backend/node_modules
# La web compilada (server.js la sirve desde ../web/dist)
COPY --from=web /app/web/dist ./web/dist
# Versión derivada de git en build-time (version.js la lee en runtime)
COPY --from=gitinfo /appversion ./backend/.appversion

WORKDIR /app/backend
EXPOSE 4000

# Health check (usa el endpoint /health que verifica la DB)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
