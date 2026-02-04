# Architecture Review (Layer-by-Layer) + Logical Weaknesses

## Scope

- Trading signal generation (18-layer analysis)
- Auto-trading execution gates
- Liquidity/structure/phase logic
- Risk + execution gates
- Data -> Logic -> Risk -> Execution separation

## Current Layered Decision Stack (Summary)

1. **Data inputs**: EA quotes/bars + RSS + optional external feeds.
2. **Technical analysis**: multi-TF indicators + candle analysis.
3. **SMC / Liquidity**: sweeps, OB/FVG, liquidity quality scoring.
4. **Market phase**: accumulation/expansion/retracement/distribution.
5. **Confluence**: weighted multi-layer score + strict checklist.
6. **L18 readiness**: final guard for execution (decision state + confluence).
7. **Execution**: risk, session, news, spread, and broker gates.

## Logical Weaknesses (Not just code)

1. **Decision state source**
   - Some signals carry decision state in L18 metrics rather than `signal.isValid.decision`.
   - Risk: auto-trading can misread state when only L18 is populated.

2. **Decision score source mismatch**
   - Execution gates read score from `signal.isValid.decision.score` even when L18 has the score.
   - Risk: smart-strong score gating under/over-filters.

3. **Layer readiness vs execution gating drift**
   - L18 readiness is computed, but if the signal’s decision state isn’t aligned, gating becomes inconsistent.

## Fixes Implemented (Minimal + Safe)

- **L18-aware decision state/score resolution** in auto-trading gates.
- This preserves existing logic, only fixes where the decision state/score is read from.
- **L18-aware decision state resolution** in EA bridge execution gating to prevent misclassification
  when `signal.isValid.decision` is incomplete.

## Files Touched

- `src/core/engine/trade-manager.js`
  - Added L18-aware `resolveDecisionState()` + `resolveDecisionScore()`.
  - Execution gates now use L18 decision data when available.
- `src/infrastructure/services/brokers/ea-bridge-service.js`
  - Resolve decision state from L18 when available during execution.

## Next Layered Engine Work (Optional)

- Introduce a dedicated “Layered Decision Engine” to produce a normalized entry/exit intent
  without altering the core trade logic, then optionally use it for smart exit and overrides.

## Status

- Auto-trading now respects L18 decision state/score consistently.
- No changes to core signal generation or execution logic beyond decision source alignment.
