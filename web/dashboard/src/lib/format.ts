/** Shared formatting utilities for the operator dashboard. */

/** Relative time string from an ISO timestamp (e.g. "2m ago", "just now"). */
export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Format composite risk (0–1) as a percentage string with 1 decimal. */
export function formatRisk(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** Format temperature in °C with 1 decimal. */
export function formatTemp(value: number): string {
  return `${value.toFixed(1)}\u00b0C`
}

/** Format position error in degrees with 2 decimals. */
export function formatDeg(value: number): string {
  return `${value.toFixed(2)}\u00b0`
}

/** Format acceleration in m/s² with 2 decimals. */
export function formatAccel(value: number): string {
  return `${value.toFixed(2)} m/s\u00b2`
}

/** Format gyro in rad/s with 3 decimals. */
export function formatGyro(value: number): string {
  return `${value.toFixed(3)} rad/s`
}

/** Format control loop frequency in Hz with 0 decimals. */
export function formatFreq(value: number): string {
  return `${value.toFixed(0)} Hz`
}

/** Human-readable z-score key labels. */
export const Z_SCORE_LABELS: Record<string, string> = {
  position_error_z: 'Position Error',
  accel_z: 'Acceleration',
  gyro_z: 'Gyroscope',
  temperature_z: 'Temperature',
}

/** Map intent names to human-readable descriptions. */
export const INTENT_LABELS: Record<string, string> = {
  AssetStatus: 'Asset Status',
  FleetOverview: 'Fleet Overview',
  ExplainRisk: 'Explain Risk',
  RecommendAction: 'Recommend Action',
  AcknowledgeIncident: 'Acknowledge',
  FallbackIntent: 'General',
}
