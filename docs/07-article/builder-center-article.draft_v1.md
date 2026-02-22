# AIdeas: Streaming Agents — A Voice-Driven AI Copilot for Robotic Fleet Maintenance

<!--
BUILDER CENTER METADATA
========================
Tags: #aideas-2025  #workplace-efficiency  #NAMER
Cover image: [TODO — Photo of Reachy Mini on desk with dashboard visible on monitor behind it]
-->

---

## App Category

**Workplace Efficiency**

---

## My Vision

There's a robot on my desk. Its name is R-17.

Right now, it's running fine — head tracking smoothly, joint temperatures stable, control loops humming at 50 Hz. But in about eight minutes, that's going to change. Joint 3 will start drifting. Temperature will creep up. The position error between where the servo *wants* to be and where it *actually is* will slowly grow. And if nobody catches it, R-17 will fault out.

Now imagine R-17 isn't alone. Imagine 200 of these robots on a warehouse floor — picking, sorting, moving — 24 hours a day. One of them is about to fail. Which one? When? Why? And what should you do about it?

That's what **Streaming Agents** answers.

I built a real-time predictive maintenance copilot that continuously monitors live telemetry from robotic systems, detects early warning signs of failure *before* they happen, and explains the risk in plain English — through voice or chat. Instead of staring at dashboards and parsing logs, a floor supervisor can simply ask:

> *"Hey, what's failing right now?"*

And get a spoken, evidence-backed answer:

> *"R-17 is showing elevated joint temperature and increasing position error on actuator 3. Composite risk score is 0.74. I recommend scheduling preventive maintenance within the next shift."*

No data science degree required. No dashboard fatigue. Just clear answers and actionable recommendations.

---

## Why This Matters

Unplanned downtime is the silent killer of operational efficiency.

In warehouse robotics alone, a single robot going down unexpectedly can cascade into missed picks, delayed shipments, and manual workarounds that cost thousands per hour. Across manufacturing, logistics, and facility operations, unplanned equipment failures account for an estimated **$50 billion annually** in lost productivity.

The traditional approach — wait for something to break, then scramble to fix it — is reactive, expensive, and entirely avoidable.

Predictive maintenance promises to fix this, but most solutions require dedicated data science teams, months of model training, and expensive sensor infrastructure. Small and mid-size operations teams get left behind.

**Streaming Agents changes that equation.** It brings enterprise-grade predictive maintenance to teams that lack dedicated reliability engineering resources. The system watches the telemetry so humans don't have to, speaks up when something is wrong, and explains *why* in language anyone can understand.

This matters because:

- **Maintenance engineers** get early warnings instead of emergency calls
- **Floor supervisors** can ask natural language questions instead of interpreting dashboards
- **Facility managers** see fewer surprise outages and lower maintenance costs
- **Operations teams** move from reactive firefighting to proactive planning

And because we built it on real hardware with real sensors, this isn't a theoretical exercise — it's a working system monitoring a real robot, right now, on my desk.

---

## How I Built This

### The Architecture: Four Specialized Agents

Streaming Agents isn't a monolith — it's a pipeline of four specialized agents, each with a distinct responsibility:

<!-- [TODO: Insert architecture diagram showing the four agents in a pipeline] -->

**1. Signal Agent** — The Watcher

The Signal Agent consumes live telemetry from the robot's edge exporter via Amazon Kinesis. For every data point, it maintains rolling baselines, computes z-scores for anomaly detection, and calculates a **composite risk score** using a deterministic, weighted formula:

```
Composite Risk =
    0.35 × temperature_anomaly
  + 0.25 × vibration_anomaly
  + 0.20 × position_error_deviation
  + 0.10 × control_loop_degradation
  + 0.10 × threshold_breach
```

This isn't a black box. Every weight is explainable, every score is reproducible. The LLM never touches this math.

**2. Diagnosis Agent** — The Detective

When risk increases, the Diagnosis Agent activates. It examines which signals are contributing most to the score, compares current values against historical baselines, and generates a **reasoning capsule** — a structured, deterministic explanation of *why* the system thinks something is wrong:

```json
{
  "contributing_signals": ["board_temperature_c", "joint_position_error_deg"],
  "baseline_values": { "board_temperature_c": 38.2, "joint_position_error_deg": 0.12 },
  "current_values": { "board_temperature_c": 47.8, "joint_position_error_deg": 1.85 },
  "deviation_magnitude": { "board_temperature_c": 2.4, "joint_position_error_deg": 3.1 },
  "composite_risk": 0.74,
  "confidence": 0.82,
  "recommended_action": "Schedule preventive maintenance — actuator 3 joint assembly"
}
```

This capsule is generated *before* the LLM ever sees it. The reasoning is deterministic. The LLM's job is to narrate it clearly — not to invent it.

**3. Actions Agent** — The Operator

The Actions Agent decides what to do with the diagnosis. It creates incident records, suppresses duplicates (so you don't get 50 alerts for the same problem), applies cooldown logic, and escalates severity if risk persists over time. Every incident is stored with its reasoning capsule as evidence.

**4. Conversation Agent** — The Voice

This is the user-facing layer. When someone asks "What's failing?" or "Why is R-17 at risk?", the Conversation Agent retrieves the current asset state, active incidents, and reasoning capsules, then uses Amazon Bedrock to generate a clear, confidence-aware response. Amazon Lex handles voice input, and Amazon Polly speaks the answer back.

The LLM enhances the narrative. It does not generate the reasoning.

### The Edge: Real Hardware, Real Telemetry

Here's where this project diverges from most demos: **the telemetry is real.**

R-17 is a Reachy Mini — a wireless, Raspberry Pi-powered desktop robot with a 6-degree-of-freedom Stewart platform head, 9 servo motors, a 4-microphone array, and an onboard IMU. It runs a FastAPI daemon on port 8000 that exposes joint positions, motor states, and system health metrics via REST API and WebSocket.

I built an edge exporter that runs directly on the robot's Raspberry Pi. Every two seconds, it:

1. **Reads real sensor data** — board temperature from the IMU, accelerometer readings (vibration proxy), gyroscope data (rotational stability), and joint positions from all 7 head actuators
2. **Computes derived signals** — position error (commanded vs. actual), acceleration magnitude, gyroscope magnitude, control loop frequency drift
3. **Publishes to AWS** — normalized telemetry events flow through MQTT to AWS IoT Core, then into Amazon Kinesis for stream processing

The signals being monitored:

| Signal | Source | What It Tells Us |
|--------|--------|-----------------|
| Board Temperature (°C) | IMU sensor | Motor/driver thermal state |
| Acceleration Magnitude (m/s²) | IMU accelerometer | Vibration signature — mechanical looseness, worn joints |
| Gyroscope Magnitude (rad/s) | IMU gyroscope | Rotational instability — unexpected movement |
| Joint Position Error (°) | Commanded vs. actual position | Servo degradation — struggling to reach targets |
| Control Loop Frequency (Hz) | Daemon statistics | System health — computational or communication stress |
| Error Count | Daemon statistics | Cumulative hardware fault accumulation |

This is exactly how industrial predictive maintenance works — vibration analysis, thermal monitoring, and position accuracy tracking — just on a desktop robot instead of a 2-ton CNC machine.

### The AWS Stack

<!-- [TODO: Insert AWS architecture diagram] -->

| Service | Role |
|---------|------|
| **AWS IoT Core** | Receives MQTT telemetry from the edge exporter on the robot |
| **Amazon Kinesis Data Streams** | Real-time ingestion pipeline for telemetry events |
| **AWS Lambda** | Runs the Signal, Diagnosis, and Actions agents as stream processors |
| **Amazon DynamoDB** | Stores asset state, incidents, reasoning capsules, and configuration |
| **Amazon Bedrock** | Powers conversational explanations via the Conversation Agent |
| **Amazon Lex** | Voice input — natural language understanding for spoken queries |
| **Amazon Polly** | Voice output — speaks responses back to the user |
| **Amazon API Gateway** | Exposes the copilot interface to the frontend |
| **Amazon CloudWatch** | Monitoring and observability for the platform itself |

Everything runs on the AWS Free Tier. The entire infrastructure is defined in Terraform and can be torn down and recreated in minutes.

### Development with Kiro

Kiro was instrumental in maintaining architectural discipline throughout the build. I used Kiro's spec-driven development to define agent contracts, enforce phase boundaries, and generate implementation that stayed aligned with the locked architecture. The agent separation — Signal, Diagnosis, Actions, Conversation — was defined as specs before any code was written, which meant the implementation could progress systematically without architectural drift.

<!-- [TODO: Add specific Kiro workflow examples once build is complete] -->

---

## Demo

<!--
[TODO: This section needs to be completed after the build. Options:]

Option A — Embedded YouTube video (recommended):
Record a 3-minute demo showing:
1. R-17 on the desk, moving normally (10 seconds)
2. Dashboard showing live telemetry — all green (10 seconds)
3. Trigger degradation injection (5 seconds)
4. Watch risk score climb in real time, signals going yellow/red (30 seconds)
5. Incident auto-created with reasoning capsule (15 seconds)
6. Voice interaction: "What's failing right now?" → spoken response (30 seconds)
7. Voice interaction: "Why is R-17 at risk?" → detailed explanation (30 seconds)
8. Show the reasoning capsule — deterministic evidence (15 seconds)
9. Resolution / summary (15 seconds)

Option B — Annotated screenshots:
1. Screenshot: R-17 on desk with dashboard on monitor
2. Screenshot: Live telemetry dashboard showing normal operation
3. Screenshot: Risk score climbing, signals degrading
4. Screenshot: Auto-generated incident with reasoning capsule
5. Screenshot: Voice/chat interaction with copilot response
6. Screenshot: Reasoning capsule detail view

Option C — GIF + Screenshots:
Animated GIF of the risk score climbing, plus static screenshots

CAPTURE NOTES:
- Film R-17 from an angle that shows both the robot and the screen
- Make sure the robot is visibly moving/tracking during the "normal" phase
- The degradation should be visible in both the dashboard AND the robot's behavior
- Voice interaction is the money shot — capture audio
-->

**[Video / Screenshots to be inserted after build completion]**

In the demo, you'll see R-17 operating normally on my desk while Streaming Agents monitors its telemetry in real time. Then, we inject a gradual degradation — simulating the kind of wear that happens over weeks of continuous operation, compressed into minutes. Watch as:

- The composite risk score climbs from green to yellow to red
- The Diagnosis Agent identifies exactly which signals are contributing
- An incident is automatically created with a structured reasoning capsule
- I ask the copilot, by voice: *"What's happening with R-17?"*
- And it responds, by voice, with a clear explanation and recommended action

The entire interaction — from first anomaly to actionable recommendation — happens in under 30 seconds.

---

## What I Learned

### Deterministic reasoning builds trust

Early in the project, I faced a critical design decision: should the LLM analyze the telemetry and determine what's failing? The answer was a firm no. In operational environments, people need to *trust* the system's reasoning. If an AI tells you to shut down a robot for maintenance, you need to understand *exactly* why — and the answer needs to be the same every time you ask.

By building the risk scoring and diagnosis logic as deterministic, explainable algorithms — and only using the LLM to narrate the results in natural language — we get the best of both worlds: rigorous, reproducible reasoning with a human-friendly interface.

### Real hardware changes everything

I could have simulated all the telemetry. It would have been faster and easier. But building the edge exporter to read real IMU data, real joint positions, and real control loop metrics from an actual robot forced me to confront the messiness of real-world data — sensor noise, timing jitter, the difference between what documentation says a robot exposes and what it actually exposes.

That experience directly shaped the architecture. The rolling baseline approach, the z-score anomaly detection, the fallback logic when target joint positions aren't available — all of these emerged from working with real hardware, not from a whiteboard.

### Streaming changes how you think about AI

Most AI applications are request-response: you ask, it answers. Streaming Agents is fundamentally different. The system is *always watching*, always computing, always updating its risk model. The AI doesn't wait for you to ask — it proactively creates incidents when risk exceeds thresholds. The conversation interface is important, but it's the *last* step in a pipeline that's been running continuously.

This shift — from reactive AI to proactive, streaming AI — is where I believe the next wave of enterprise AI applications will emerge.

### The power of the voice interface

When I first built the chat interface, it worked fine. But when I added voice — when I could literally ask the robot "What's wrong with you?" and hear it explain its own health status — the experience transformed. It went from a monitoring tool to a *copilot*. That's a meaningful difference for a maintenance engineer who has their hands full and can't stare at a screen.

---

<!--
POST-PUBLICATION CHECKLIST
===========================
Before publishing:
[ ] Cover image uploaded (R-17 photo with dashboard)
[ ] All [TODO] sections completed
[ ] Demo video recorded and embedded (or screenshots inserted)
[ ] AWS architecture diagram inserted
[ ] Agent pipeline diagram inserted
[ ] Tags applied: #aideas-2025 #workplace-efficiency #NAMER
[ ] Builder Center profile updated
[ ] Title matches format: "AIdeas: Streaming Agents"
[ ] Proofread for technical accuracy against context.md
[ ] All code snippets tested and accurate
[ ] No placeholder text remaining

After publishing:
[ ] Share on LinkedIn, Twitter/X, dev communities
[ ] Post in AIdeas Builder Space
[ ] Cross-promote in robotics / IoT communities
[ ] Engage with comments promptly
-->
