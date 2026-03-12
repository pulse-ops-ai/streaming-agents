# Risk Scoring Model (Telemetry v2)

This document defines the deterministic Phase 2 risk scoring model used by the Signal Agent.

Phase discipline:
- Phase 2: telemetry → rolling baselines → z-scores → composite risk (complete)
- Phase 3: incidents + DiagnosisEvents / reasoning capsules (complete)

---

## Composite Risk Formula (Locked for Phase 2)

composite_risk =
  0.35 * position_error_z +
  0.25 * accel_z +
  0.15 * gyro_z +
  0.15 * temperature_z +
  0.10 * threshold_breach

Where:
- position_error_z = rolling z-score of joint_position_error_deg
- accel_z = rolling z-score of accel_magnitude_ms2
- gyro_z = rolling z-score of gyro_magnitude_rads
- temperature_z = rolling z-score of board_temperature_c
- threshold_breach = deterministic binary flag (0/1) from hard limits:
  - control_loop_error_count > 0
  - control_mode != "enabled"
  - backend daemon error present
  - or error_code != null

Notes:
- All z-scores are computed per-asset using a rolling mean/std window.
- The composite is clamped to [0, 1].
- The model is deterministic and explainable; it does not depend on LLM output.

---

## Risk States (Recommended)

- nominal: risk_score < 0.50
- elevated: 0.50 ≤ risk_score < 0.75
- critical: risk_score ≥ 0.75

(Thresholds can be tuned, but must remain deterministic.)

---

## Incident Trigger Rule (Phase 3 — Complete)

When risk crosses threshold, the Actions Agent creates an incident:

If:
- risk_score >= threshold
- no active incident exists for asset
- cooldown window expired

Then:
- Create new incident in DynamoDB
- Diagnosis Agent generates a DiagnosisEvent (structured reasoning capsule) via Bedrock
