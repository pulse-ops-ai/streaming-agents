# Reachy Telemetry Mapping

How real Reachy-Mini daemon/SDK fields map to the `r17.telemetry.v1` schema.

---

## Source Systems

| Source | Description |
|--------|-------------|
| `reachy-daemon` | Low-level gRPC service running on-board the Reachy-Mini |
| `reachy-sdk` | Python SDK (`reachy_sdk`) that wraps the daemon via gRPC |
| `simulator` | Synthetic telemetry generator (deterministic, used for demos) |
| `replay` | Pre-recorded telemetry replayed from file |

---

## Signal Mapping

| Schema Field | Reachy Daemon / SDK Field | Unit | Proxy? | Notes |
|-------------|--------------------------|------|--------|-------|
| `joint_3_torque_nm` | `joints["r_shoulder_roll"].present_load` | % of max torque | **Yes — proxy** | Reachy exposes load as a percentage (0–100%) of stall torque. Convert via: `torque_nm = present_load / 100.0 * STALL_TORQUE_NM`. For the MX-28 servo, stall torque at 12V is approximately 2.5 Nm. |
| `joint_3_temperature_c` | `joints["r_shoulder_roll"].present_temperature` | °C | No | Direct reading from the servo's internal thermistor. |
| `motor_current_amp` | `joints["r_shoulder_roll"].present_current` | mA → A | **Yes — proxy** | Reachy SDK reports current in mA. Convert: `current_amp = present_current / 1000.0`. Not all firmware versions expose this; may be estimated from load + voltage. |
| `joint_position_error_deg` | Computed: `abs(goal_position - present_position)` | degrees | No | Absolute difference between commanded and actual position. Both fields are available on every joint object. |
| `error_code` | `joints["r_shoulder_roll"].hardware_error_status` | string | No | Bitfield decoded to a string code (e.g., `"OVERHEATING"`, `"OVERLOAD"`). Null when no error flags are set. |

---

## Joint Naming Convention

The MVP monitors **Joint 3**, which maps to the Reachy-Mini `r_shoulder_roll` joint. The "Joint 3" designation follows the kinematic chain index starting from the torso:

| Index | Reachy Joint Name | Description |
|-------|------------------|-------------|
| 1 | `r_shoulder_pitch` | Shoulder forward/backward |
| 2 | `r_shoulder_roll` | Shoulder in/out (abduction) |
| 3 | `r_arm_yaw` | Upper arm rotation |

> Note: The MVP uses `r_shoulder_roll` (index 2 in some SDK versions) as the representative "Joint 3" for the gear-wear degradation scenario. The naming reflects the physical joint most susceptible to gradual wear under repetitive load.

---

## Proxy Signal Rationale

**Torque**: The Dynamixel MX-28 servos in Reachy-Mini do not expose a direct torque sensor. The `present_load` register reports the percentage of maximum torque being applied. We scale this to Newton-metres using the known stall torque specification. This is an approximation — actual torque depends on motor efficiency, gear backlash, and load dynamics — but is sufficient for trending and anomaly detection.

**Current**: Some firmware versions report `present_current` directly; others do not expose it. When unavailable, current can be estimated from `present_load` and `present_voltage` using the motor's torque constant. The schema accepts either the direct reading or the estimate.

---

## Simulator Fidelity

The `simulator` source generates telemetry that follows the same schema but does not read from real hardware. Instead:

- Baseline values are sampled from typical operating ranges.
- Degradation injection applies a deterministic ramp to torque and temperature.
- Position error spikes are injected at configurable intervals.
- Error codes are emitted only when degradation exceeds safety thresholds.

The simulator uses a fixed random seed for reproducible demo scenarios.
