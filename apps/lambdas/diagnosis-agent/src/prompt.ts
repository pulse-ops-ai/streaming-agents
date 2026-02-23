import type { RiskEvent } from '@streaming-agents/core-contracts'

/**
 * Build system and user messages for the Bedrock diagnosis prompt.
 *
 * Pure function — no side effects, fully testable without Bedrock.
 */
export function buildDiagnosisPrompt(riskEvent: RiskEvent): { system: string; user: string } {
  const { z_scores, last_values, contributing_signals } = riskEvent

  const isContributing = (signal: string): string =>
    contributing_signals.includes(signal) ? 'YES' : 'no'

  const system = [
    'You are a predictive maintenance analyst for industrial robotics.',
    'Analyze the sensor data and explain what is likely failing and why.',
    'Respond ONLY with the specified JSON format.',
  ].join(' ')

  const user = `## Asset: ${riskEvent.asset_id}
## Current Risk State: ${riskEvent.risk_state} (composite score: ${riskEvent.composite_risk.toFixed(3)})

## Signal Analysis
| Signal | Raw Value | Z-Score | Contributing? |
|--------|-----------|---------|---------------|
| Joint Position Error (deg) | ${last_values.joint_position_error_deg} | ${z_scores.position_error_z.toFixed(2)} | ${isContributing('joint_position_error_deg')} |
| Acceleration (m/s²) | ${last_values.accel_magnitude_ms2} | ${z_scores.accel_z.toFixed(2)} | ${isContributing('accel_magnitude_ms2')} |
| Gyroscope (rad/s) | ${last_values.gyro_magnitude_rads} | ${z_scores.gyro_z.toFixed(2)} | ${isContributing('gyro_magnitude_rads')} |
| Board Temperature (°C) | ${last_values.board_temperature_c} | ${z_scores.temperature_z.toFixed(2)} | ${isContributing('board_temperature_c')} |

## Threshold Breach: ${riskEvent.threshold_breach} (0.0=none, 0.5=warn, 1.0=critical)

## Signal Descriptions
- joint_position_error_deg: Actuator positioning accuracy. High values indicate mechanical wear or control instability.
- accel_magnitude_ms2: Vibration/acceleration magnitude. High values indicate mechanical looseness or impact.
- gyro_magnitude_rads: Rotational velocity. High values indicate instability or uncontrolled movement.
- board_temperature_c: Electronics temperature. High values indicate thermal stress or cooling failure.

## Required Response Format
Respond with ONLY a JSON object matching this structure:
{
  "root_cause": "string - concise 1-2 sentence explanation",
  "evidence": [{ "signal": "string", "observation": "string", "z_score": 0.0 }],
  "confidence": "low|medium|high",
  "recommended_actions": ["string"],
  "severity": "info|warning|critical"
}

Rules:
- Include only signals with |z_score| > 2.0 in evidence
- severity must match: elevated risk → "warning", critical risk → "critical"
- recommended_actions should be specific to robotic actuators
- confidence is "high" when multiple correlated signals confirm the diagnosis, "medium" for single signal anomalies, "low" when signals are ambiguous`

  return { system, user }
}
