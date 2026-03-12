# Dashboard API Contract

## Overview

The Dashboard API is a lightweight JSON API served by a single Lambda Function URL. It reads from three DynamoDB tables to serve the React dashboard. No API Gateway required.

**Base URL:** `https://<function-url-id>.lambda-url.us-east-1.on.aws`

## Authentication

Demo mode: `authorization_type = "NONE"` (public). For production, switch to `AWS_IAM` and use SigV4 from the frontend via Cognito.

---

## Endpoints

### GET `/api/fleet`

Returns the current state of all assets in the fleet.

**Response: `FleetOverviewResponse`**

```typescript
interface FleetOverviewResponse {
  /** ISO 8601 timestamp of the API response */
  timestamp: string
  /** Total asset count */
  total_assets: number
  /** Counts by risk state */
  risk_summary: {
    nominal: number
    elevated: number
    critical: number
  }
  /** Active incident count */
  active_incidents: number
  /** Per-asset summary, sorted by composite_risk desc */
  assets: FleetAssetSummary[]
}

interface FleetAssetSummary {
  asset_id: string
  risk_state: 'nominal' | 'elevated' | 'critical'
  composite_risk: number
  /** Key signal values for the asset card */
  last_values: {
    board_temperature_c: number
    joint_position_error_deg: number
    control_loop_freq_hz: number
    accel_magnitude_ms2: number
    gyro_magnitude_rads: number
  }
  /** ISO 8601 timestamp of last update */
  updated_at: string
  /** Whether this asset has an active incident */
  has_active_incident: boolean
}
```

**Data source:** Scan `asset-state` table (6 items max for demo fleet). Cross-reference `incidents` table for `has_active_incident`.

---

### GET `/api/assets/:id`

Returns detailed current state for a single asset, plus the most recent 60 history points (30 seconds at 2 Hz).

**Response: `AssetDetailResponse`**

```typescript
interface AssetDetailResponse {
  asset_id: string
  risk_state: 'nominal' | 'elevated' | 'critical'
  composite_risk: number
  reading_count: number
  updated_at: string
  /** Per-signal z-scores */
  z_scores: {
    position_error_z: number
    accel_z: number
    gyro_z: number
    temperature_z: number
  }
  /** Current threshold breach value */
  threshold_breach: number
  /** Signal names with |z| > 2.0 */
  contributing_signals: string[]
  /** Current raw signal values */
  last_values: {
    board_temperature_c: number
    accel_magnitude_ms2: number
    gyro_magnitude_rads: number
    joint_position_error_deg: number
    control_loop_freq_hz: number
  }
  /** Most recent history for sparkline/mini chart */
  recent_history: HistoryPoint[]
  /** Active incident for this asset, if any */
  active_incident: IncidentSummary | null
}
```

**Data source:** GetItem from `asset-state` + Query `asset-history` (SK desc, limit 60) + Query `incidents` GSI for active.

---

### GET `/api/assets/:id/history`

Returns time-series history for charting.

**Query parameters:**
- `minutes` — Window size in minutes (default: 5, max: 60)

**Response: `AssetHistoryResponse`**

```typescript
interface AssetHistoryResponse {
  asset_id: string
  /** ISO 8601 start of the query window */
  from: string
  /** ISO 8601 end of the query window */
  to: string
  /** Number of data points returned */
  count: number
  /** Time-series data points, chronological order */
  points: HistoryPoint[]
}

interface HistoryPoint {
  /** ISO 8601 timestamp */
  timestamp: string
  /** Composite risk score (0.0–1.0) */
  composite_risk: number
  /** Risk state at this point */
  risk_state: 'nominal' | 'elevated' | 'critical'
  /** Per-signal z-scores */
  z_scores: {
    position_error_z: number
    accel_z: number
    gyro_z: number
    temperature_z: number
  }
  /** Raw signal values at this point */
  last_values: {
    board_temperature_c: number
    accel_magnitude_ms2: number
    gyro_magnitude_rads: number
    joint_position_error_deg: number
    control_loop_freq_hz: number
  }
  /** Threshold breach value */
  threshold_breach: number
  /** Contributing signals */
  contributing_signals: string[]
}
```

**Data source:** Query `asset-history` with `PK = :id` and `SK BETWEEN :from AND :to`, ScanIndexForward = true.

At 2 Hz, a 5-minute window returns ~600 points. A 1-minute window returns ~120 points. The frontend can downsample if needed.

---

### GET `/api/incidents`

Returns active incidents.

**Query parameters:**
- `status` — Filter by status: `open`, `escalated`, `all` (default: `all` active = open + escalated)

**Response: `IncidentsResponse`**

```typescript
interface IncidentsResponse {
  /** Active incident count */
  count: number
  /** Incidents sorted by opened_at desc */
  incidents: IncidentSummary[]
}

interface IncidentSummary {
  incident_id: string
  asset_id: string
  status: 'opened' | 'escalated' | 'resolved'
  severity: 'info' | 'warning' | 'critical'
  root_cause: string
  opened_at: string
  escalated_at: string | null
  acknowledged_at: string | null
  resolved_at: string | null
  /** Duration string for display (e.g., "8m 14s") */
  duration: string
}
```

**Data source:** Scan `incidents` table with filter on status. For demo fleet size (< 50 incidents), a filtered scan is simpler and cheaper than per-asset GSI queries.

---

## Error Responses

All endpoints return standard error shapes:

```typescript
interface ErrorResponse {
  error: string
  message: string
  status: number
}
```

| Status | Meaning |
|--------|---------|
| 400 | Invalid parameters (e.g., bad asset_id format) |
| 404 | Asset not found |
| 500 | Internal error (DynamoDB failure) |

---

## CORS

The Function URL should set CORS headers for the dashboard origin:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

For demo, wildcard origin is acceptable.

---

## Frontend Polling

The dashboard polls the API at fixed intervals:
- Fleet overview: every 2 seconds
- Asset detail: every 1 second (when viewing a specific asset)
- Incidents: every 5 seconds

No WebSocket needed for demo — polling is simpler and sufficient at these intervals.
