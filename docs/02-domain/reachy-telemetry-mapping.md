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

## Derived Metrics (telemetry v2)

The exporter emits `r17.telemetry.v2` metrics using a mix of direct and derived values.

### Sampling

- `sampling_hz`: configurable (default: 2.0 Hz)
- `dt_s`: measured time delta between successive samples (`timestamp[i] - timestamp[i-1]`) in seconds

### Accelerometer magnitude (vibration proxy)

Source: `mini.imu["accelerometer"]` → `[ax, ay, az]` in m/s²

Formula:

- `accel_magnitude_ms2 = sqrt(ax^2 + ay^2 + az^2)`

Notes:
- This captures overall vibration/acceleration energy.
- Optional (for later): maintain a rolling baseline; Phase 2 only emits the raw magnitude.

### Gyroscope magnitude (rotational instability proxy)

Source: `mini.imu["gyroscope"]` → `[gx, gy, gz]` in rad/s

Formula:

- `gyro_magnitude_rads = sqrt(gx^2 + gy^2 + gz^2)`

Notes:
- Spikes may indicate unexpected rotational movement or mechanical play.

### Joint position error (actuator struggle signal)

Sources:
- Actual joints: `/api/state/full?with_head_joints=true` → `head_joints[]` (radians)
- Target joints: `/api/state/full?with_target_head_joints=true` → `target_head_joints[]` (radians)

Definition:
- We select a representative monitored joint index: `J3_INDEX = 2` (0-based index into `head_joints` arrays)
- `actual_rad = head_joints[J3_INDEX]`
- `target_rad = target_head_joints[J3_INDEX]`

Formula:

- `error_rad = abs(target_rad - actual_rad)`
- `joint_position_error_deg = error_rad * (180.0 / pi)`

Fallback rule:
- If `target_head_joints` is missing/null, set `joint_position_error_deg = 0` and set a label:
  - `labels.position_error_source = "missing_target"`

### Daemon control loop metrics (system health)

Source: `/api/daemon/status`

Extract:

- `control_loop_freq_hz = backend_status.control_loop_stats.mean_control_loop_frequency`
- `control_loop_max_interval_ms = backend_status.control_loop_stats.max_control_loop_interval * 1000.0`
- `control_loop_error_count = backend_status.control_loop_stats.nb_error`

Notes:
- Do not parse `control_loop_stats.motor_controller` (string). Store it only as debug text if needed.
