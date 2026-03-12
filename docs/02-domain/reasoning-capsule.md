# Reasoning Capsule Model

Each incident contains a reasoning capsule — a structured, deterministic explanation of why risk was elevated. In the codebase, this is implemented as a **DiagnosisEvent** emitted by the Diagnosis Agent.

Purpose:
Make predictive maintenance explainable.

## Structure (DiagnosisEvent)

- asset_id
- timestamp
- root_cause — LLM-generated explanation of the failure mode
- evidence[] — contributing signals with:
  - signal_name
  - baseline_value
  - current_value
  - z_score
  - deviation
- composite_risk_score
- confidence — high / medium / low
- recommended_actions[] — suggested operator responses
- severity — info / warning / critical
- model_id — Bedrock model used
- token counts (input_tokens, output_tokens)

## Design Principle

Every automated incident must be explainable without calling the LLM.

The LLM enhances explanation but does not create the reasoning. The composite risk score, z-scores, and threshold breaches are all computed deterministically by the Signal Agent. The Diagnosis Agent uses these deterministic inputs as context for generating a human-readable explanation.
