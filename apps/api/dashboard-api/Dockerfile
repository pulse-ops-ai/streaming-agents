FROM node:22-alpine AS builder

# Enable corepack for pnpm support
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace configuration and dependency files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/core-contracts/package.json ./packages/core-contracts/
COPY packages/domain-models/package.json ./packages/domain-models/
COPY apps/api/dashboard-api/package.json ./apps/api/dashboard-api/

# Install dependencies
RUN pnpm install --filter "@streaming-agents/schemas" --filter "@streaming-agents/core-contracts" --filter "@streaming-agents/domain-models" --filter "@streaming-agents/dashboard-api" --frozen-lockfile

# Copy source code for relevant packages
COPY packages/schemas/ ./packages/schemas/
COPY packages/core-contracts/ ./packages/core-contracts/
COPY packages/domain-models/ ./packages/domain-models/
COPY apps/api/dashboard-api/ ./apps/api/dashboard-api/
COPY tsconfig.base.json ./

# Build dependencies, then the app
RUN pnpm --filter "@streaming-agents/schemas" run build
RUN pnpm --filter "@streaming-agents/core-contracts" --filter "@streaming-agents/domain-models" run build
RUN pnpm --filter "@streaming-agents/dashboard-api" run build

# Start a fast production runtime image
FROM node:22-alpine AS runner
# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY --from=builder /app/packages/schemas/package.json ./packages/schemas/
COPY --from=builder /app/packages/core-contracts/package.json ./packages/core-contracts/
COPY --from=builder /app/packages/domain-models/package.json ./packages/domain-models/
COPY --from=builder /app/apps/api/dashboard-api/package.json ./apps/api/dashboard-api/

# Prune dev dependencies for lean image
RUN pnpm install --filter "@streaming-agents/dashboard-api" --prod --frozen-lockfile

# Copy compiled files
COPY --from=builder /app/packages/schemas/dist/ ./packages/schemas/dist/
COPY --from=builder /app/packages/core-contracts/dist/ ./packages/core-contracts/dist/
COPY --from=builder /app/packages/domain-models/dist/ ./packages/domain-models/dist/
COPY --from=builder /app/apps/api/dashboard-api/dist/ ./apps/api/dashboard-api/dist/

WORKDIR /app/apps/api/dashboard-api
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main.js"]
