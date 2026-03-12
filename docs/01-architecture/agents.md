# Agent Architecture

Streaming Agents follows an agent-oriented streaming architecture with 4 specialized agents deployed as AWS Lambda functions (7 Lambda services total including ingestion and simulator controller/worker).

## 1. Signal Agent

Responsibility:
- Consume telemetry stream (from r17-ingested Kinesis)
- Maintain rolling EMA baselines per asset
- Compute z-scores for each signal
- Compute deterministic composite risk score

Output:
- Updated asset state in DynamoDB
- RiskEvent emitted to r17-risk-events Kinesis stream

---

## 2. Diagnosis Agent

Triggered when risk increases (consumes r17-risk-events).

Responsibility:
- Identify contributing signals from z-scores
- Generate root cause analysis via Bedrock (Claude Sonnet 4.6)
- Emit structured DiagnosisEvent (the implementation of the reasoning capsule concept)

Output:
- DiagnosisEvent to r17-diagnosis Kinesis stream

---

## 3. Actions Agent

Consumes r17-diagnosis Kinesis stream.

Responsibility:
- Create new incident records
- Suppress duplicates via cooldown windows
- Escalate severity based on diagnosis
- Manage incident lifecycle (opened → escalated → resolved)

Output:
- Incident record in DynamoDB (incidents table with GSI)
- ActionEvent to r17-actions Kinesis stream

---

## 4. Conversation Agent

Query-driven — reads DynamoDB on demand, not a pipeline consumer.

Responsibility:
- Fulfill Lex V2 voice intents (5 intents: AssetStatus, FleetOverview, ExplainRisk, RecommendAction, AcknowledgeIncident)
- Retrieve live asset state from DynamoDB
- Retrieve incident history and diagnosis context
- Generate natural language responses via Bedrock
- Produce SSML for Polly voice synthesis

Output:
- Lex fulfillment response with SSML + PlainText
- Polly synthesizes speech through the robot's speaker
