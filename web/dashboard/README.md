# Fleet Dashboard

Real-time dashboard for the Streaming Agents robotics uptime copilot.

## Prerequisites

- Node.js >= 22
- pnpm >= 9
- Dashboard API running at `http://localhost:3000` (see `apps/api/dashboard-api/`)

## Development

```bash
# Install dependencies (from repo root)
pnpm install

# Start the backend API
pnpm --filter @streaming-agents/dashboard-api start:dev

# Start the dashboard (separate terminal)
pnpm --filter @streaming-agents/dashboard dev
```

The dashboard runs at `http://localhost:5173` and proxies `/api/*` to the backend.

## Architecture

```
src/
  api/client.ts        # Fetch + Zod validation against @streaming-agents/domain-models
  hooks/               # TanStack Query hooks with polling intervals
  stores/ui.ts         # Zustand store for UI state (history window, etc.)
  components/          # Reusable UI primitives (RiskBadge, MetricCard, RiskChart)
  pages/               # Route-level pages
    fleet-overview.tsx  # GET /api/fleet + GET /api/incidents/active
    asset-detail.tsx    # GET /api/assets/:id + GET /api/assets/:id/history
```

## Routes

| Path | Page | Polling |
|------|------|---------|
| `/` | Fleet overview grid with risk summary | 2s |
| `/asset/:assetId` | Asset detail with risk chart + z-scores | 1s |

## Shared Contracts

All API responses are validated at runtime using Zod schemas from `@streaming-agents/domain-models`. The frontend never consumes raw JSON — every response is parsed through the same schemas the backend uses to produce responses.
