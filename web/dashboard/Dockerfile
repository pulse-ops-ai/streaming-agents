FROM node:22-alpine AS builder

# Enable corepack for pnpm support
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace and dependent files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/domain-models/package.json ./packages/domain-models/
COPY web/dashboard/package.json ./web/dashboard/

# Install exact dependencies
RUN pnpm install --filter "@streaming-agents/domain-models" --filter "@streaming-agents/dashboard" --frozen-lockfile

# Copy needed sources
COPY packages/domain-models/ ./packages/domain-models/
COPY web/dashboard/ ./web/dashboard/
COPY tsconfig.base.json ./

# Build modules in order
RUN pnpm --filter "@streaming-agents/domain-models" run build
RUN pnpm --filter "@streaming-agents/dashboard" run build

# Nginx reverse proxy environment for React SPA
FROM nginx:alpine AS runner

# Copy customized Nginx configuration for SPA routing
COPY web/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

# Copy bundled React app
COPY --from=builder /app/web/dashboard/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
