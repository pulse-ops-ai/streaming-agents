# Streaming Agents — Demo Acceptance Checklist

This checklist is used to verify that the voice copilot, dashboard, and demo fleet are ready before recording or presenting Streaming Agents.

---

## Pre-Demo Setup

Before testing any intent, confirm:

- [ ] R-17 is powered on
- [ ] Reachy voice terminal is running
- [ ] Robot speaker volume is correct
- [ ] Microphone input is working
- [ ] Demo fleet has been bootstrapped from Admin
- [ ] Fleet Overview shows the expected state
- [ ] R-1 is critical
- [ ] R-2 is elevated
- [ ] R-8 is elevated
- [ ] R-17 is nominal
- [ ] R-50 is nominal

---

## Intent 1 — Fleet Overview

### Prompt
**How’s the fleet doing?**

### Pass Criteria
- [ ] Intent resolves to `FleetOverview`
- [ ] Response is spoken clearly
- [ ] Response is concise (ideally 2–3 short sentences)
- [ ] Response mentions how many assets need attention
- [ ] Response identifies the most urgent asset
- [ ] Response correctly summarizes the rest of the fleet
- [ ] No hallucinated assets or states
- [ ] No overly long explanation

### Golden Response Target
> Three of five robots need attention. R-1 is critical with joint drift and rising temperature. R-8 and R-2 are elevated. R-17 and R-50 are operating normally.

---

## Intent 2 — Asset Status (R-17)

### Prompt
**What’s the status of R-17?**

### Pass Criteria
- [ ] Intent resolves to `AssetStatus`
- [ ] Asset slot resolves to `R-17`
- [ ] Response is short
- [ ] Response states nominal / healthy condition
- [ ] Response does not invent issues

### Golden Response Target
> R-17 is operating normally. Risk is low and telemetry is within expected range.

---

## Intent 3 — Asset Status / Explain Risk (R-1)

### Prompt
**What’s wrong with R-1?**

### Pass Criteria
- [ ] Intent resolves to `AssetStatus` or `ExplainRisk`
- [ ] Asset slot resolves to `R-1`
- [ ] Response states `critical`
- [ ] Response mentions the top 1–2 contributing signals
- [ ] Response is concise and understandable
- [ ] Response does not dump unnecessary detail

### Golden Response Target
> R-1 shows progressive joint degradation. Position error is far above baseline and temperature is rising. The asset is in critical condition.

---

## Intent 4 — Explain Risk (R-8)

### Prompt
**Why is R-8 at risk?**

### Pass Criteria
- [ ] Intent resolves to `ExplainRisk`
- [ ] Asset slot resolves to `R-8`
- [ ] Response states elevated / warning, not critical unless that is the actual state
- [ ] Response mentions thermal behavior
- [ ] Response remains short and spoken-friendly

### Golden Response Target
> R-8 is elevated due to thermal stress. Temperature is above baseline, but the asset is still stable.

---

## Intent 5 — Explain Risk (R-2)

### Prompt
**Why is R-2 elevated?**

### Pass Criteria
- [ ] Intent resolves to `ExplainRisk`
- [ ] Asset slot resolves to `R-2`
- [ ] Response mentions vibration / acceleration anomaly
- [ ] Response remains concise

### Golden Response Target
> R-2 is elevated because acceleration is above baseline. That suggests a vibration or impact anomaly.

---

## Intent 6 — Recommend Action (R-1)

### Prompt
**What should I do about R-1?**

### Pass Criteria
- [ ] Intent resolves to `RecommendAction`
- [ ] Asset slot resolves to `R-1`
- [ ] Response gives a clear operational action
- [ ] Response is 1–2 short sentences
- [ ] Response does not sound vague or generic

### Golden Response Target
> Schedule an actuator inspection immediately and reduce operational load until the issue is addressed.

---

## Intent 7 — Recommend Action (R-8)

### Prompt
**What should I do about R-8?**

### Pass Criteria
- [ ] Intent resolves to `RecommendAction`
- [ ] Asset slot resolves to `R-8`
- [ ] Response gives a lower-severity recommendation
- [ ] Response distinguishes monitoring from urgent intervention

### Golden Response Target
> Monitor R-8 closely and schedule a thermal inspection during the next maintenance window.

---

## Intent 8 — Acknowledge Incident

### Prompt
**Acknowledge the incident for R-1.**

### Pass Criteria
- [ ] Intent resolves to `AcknowledgeIncident`
- [ ] Asset slot resolves correctly
- [ ] Response confirms acknowledgment
- [ ] Response is short
- [ ] Incident state updates if that behavior is wired

### Golden Response Target
> Incident acknowledged. I’ll keep monitoring the asset for further degradation.

---

## Voice Quality Checklist

Across all intents, confirm:

- [ ] Response starts quickly enough
- [ ] Audio is loud enough
- [ ] Speech is understandable
- [ ] Phrasing is concise
- [ ] No repeated wording
- [ ] No awkward SSML pacing
- [ ] No cut-off playback
- [ ] No extremely long responses

---

## Fail Conditions

Do **not** record if any of these happen:

- [ ] Wrong asset resolved
- [ ] Wrong intent resolved repeatedly
- [ ] Response too long for spoken interaction
- [ ] Robot audio too quiet
- [ ] Answer contradicts visible dashboard state
- [ ] System says `no data` for planned demo assets
- [ ] Response hallucinates untracked conditions

---

## Recording Readiness Rule

You are ready to record when:

- [ ] FleetOverview passes
- [ ] R-1 explain/risk/recommendation passes
- [ ] R-17 status passes
- [ ] AcknowledgeIncident passes
- [ ] Voice quality is acceptable
- [ ] The same three-question sequence works twice in a row

---

## Minimum Demo Question Set

If only three voice prompts are tested before recording, use:

1. **How’s the fleet doing?**
2. **What’s wrong with R-1?**
3. **What should I do about R-1?**

This is the minimum reliable demo story.

---

## Pre-Recording Operator Flow

Before every take:

1. Open **Admin**
2. Click **Bootstrap Demo Fleet**
3. Wait for the fleet state to populate
4. Confirm:
   - [ ] R-17 live and nominal
   - [ ] R-1 critical
   - [ ] R-2 elevated
   - [ ] R-8 elevated
   - [ ] R-50 nominal
5. Open **Fleet Overview**
6. Open **R-1 Asset Detail**
7. Run the three-question sequence
8. If all pass twice, start recording
