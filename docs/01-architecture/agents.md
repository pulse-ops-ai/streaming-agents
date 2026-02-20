# Agent Architecture

Streaming Agents follows an agent-oriented streaming architecture.

## 1. Signal Agent

Responsibility:
- Consume telemetry stream
- Maintain rolling baselines
- Compute anomaly score
- Compute composite risk score

Output:
- Updated asset state
- Risk evaluation result

---

## 2. Diagnosis Agent

Triggered when risk increases.

Responsibility:
- Identify contributing signals
- Calculate confidence
- Generate reasoning capsule

Output:
- Structured explanation object

---

## 3. Actions Agent

Responsibility:
- Create new incident
- Suppress duplicates
- Escalate severity
- Enforce cooldown windows

Output:
- Incident record in DynamoDB

---

## 4. Conversation Agent

Responsibility:
- Retrieve live state
- Retrieve incident history
- Retrieve reasoning capsules
- Generate structured response via LLM

Output:
- Summary
- Detailed explanation
- Evidence
- Recommended actions
- Confidence level
