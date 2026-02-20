# Risk Scoring Model

## Composite Risk Formula (Locked)

composite_risk =
  0.4 * torque_anomaly +
  0.3 * temperature_drift +
  0.2 * position_error_deviation +
  0.1 * threshold_breach

Where:
- torque_anomaly = rolling z-score of joint_3_torque_nm
- temperature_drift = rolling z-score of joint_3_temperature_c
- position_error_deviation = rolling z-score of joint_position_error_deg
- threshold_breach = binary flag from hard safety limits (error_code, motor_current_amp)

---

## Incident Trigger Rule

If:
- risk_score >= threshold
- no active incident exists for asset
- cooldown window expired

Then:
- Create new incident
- Attach reasoning capsule

---

## Reasoning Capsule Structure

- Contributing signals
- Magnitude of deviation
- Risk score
- Confidence level
- Recommended action
