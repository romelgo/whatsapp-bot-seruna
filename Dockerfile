# ============================================================
# WHATSAPP BOT — Baileys + Express.js
# Microservicio que envía notificaciones de asistencia por WA
# ============================================================

# Node.js LTS en Alpine (imagen liviana)
FROM node:20-alpine

# Dependencias del sistema para Baileys (crypto, canvas)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# ── Directorio de trabajo ──────────────────────────────────
WORKDIR /app

# ── Instalar dependencias Node primero (cache layer) ──────
COPY package*.json ./
RUN npm ci --omit=dev

# ── Copiar el código ───────────────────────────────────────
COPY index.js .

# ── Directorio para persistir la sesión de WhatsApp ───────
# IMPORTANTE: debe montarse como volumen para no perder la sesión
RUN mkdir -p /app/baileys_auth_info

# ── Variables de entorno por defecto ──────────────────────
ENV PORT=3001 \
    NODE_ENV=production

# ── Exponer el puerto del microservicio ───────────────────
EXPOSE 3001

# ── Health check ─────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3001/ || exit 1

# ── Arranque ──────────────────────────────────────────────
CMD ["node", "index.js"]
