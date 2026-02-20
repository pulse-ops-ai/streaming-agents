# Telemetry Event Model

Each telemetry event represents a single measurement reading from an asset.

Prototype Asset: R-17 (Reachy-Mini)

## Event Schema (MVP — Locked)

- asset_id (string)
- timestamp (ISO8601)
- joint_3_torque_nm (float) — servo torque in Newton-metres
- joint_3_temperature_c (float) — motor temperature in Celsius
- motor_current_amp (float) — motor current draw in Amps
- joint_position_error_deg (float) — positional deviation in degrees
- error_code (optional string) — rare discrete fault codes

---

## Risk Scoring Inputs

Risk is calculated using:

- Z-score deviation from rolling baseline per signal
- Weighted composite formula (see risk-scoring.md)
- Threshold breach detection

---

## Design Principle

Risk scoring must be:

- Deterministic
- Explainable
- Repeatable for demo scenarios
