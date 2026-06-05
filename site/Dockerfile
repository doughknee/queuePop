# queuePop marketing site — production image for Coolify (or any Docker host).
#
# The site is fully static: the TanStack Start build prerenders the page to
# HTML (dist/client/), so we serve it with nginx. No Node runtime needed.
#
# Coolify setup:
#   - Build Pack:     Dockerfile
#   - Base Directory: /site         (this folder is the build context)
#   - Dockerfile:     ./Dockerfile
#   - Port:           80

# ---- Build stage ---------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Build + prerender (outputs static files to dist/client/).
COPY . .
RUN npm run build

# ---- Runtime stage (static, nginx) --------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/client /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

# nginx:alpine already runs: nginx -g 'daemon off;'
