# Reasoning Capsule Model

Each incident contains a reasoning capsule.

Purpose:
Make predictive maintenance explainable.

## Structure

- asset_id
- timestamp
- contributing_signals:
  - signal_name
  - baseline_value
  - current_value
  - deviation
- composite_risk_score
- confidence
- recommended_action

## Design Principle

Every automated incident must be explainable without calling the LLM.

The LLM enhances explanation but does not create the reasoning.
