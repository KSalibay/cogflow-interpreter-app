# Bugs Fixed (Development Changelog)

This document is a running, developer-facing changelog of bug fixes across:
- **Interpreter**: `json-interpreter-app/`
- **Builder**: `json-builder-app/` (related Builder-side fixes are referenced when they affect runtime behavior)
- **Deployed JATOS assets**: `jatos_win_java/study_assets_root/`

---

## 2026-03-27 — RDM block direction-transition scheduling

### Builder-authored direction transition cadence/count now applied at runtime

- **Symptom**: Researchers could only randomize direction per trial when using RDM Blocks; they could not control direction transition frequency/count within a generated block.
- **Fix**: Interpreter block expansion now applies Builder-exported direction transition scheduling controls:
  - `direction_transition_mode`: `random_each_trial` | `every_n_trials` | `exact_count`
  - `direction_transition_every_n_trials`
  - `direction_transition_count`
- **Scope**:
  - `rdm-trial`, `rdm-practice`, `rdm-dot-groups`
  - works in both trial-based and continuous experiments

**Interpreter file changed**
- `cogflow-interpreter-app/src/timelineCompiler.js`

**JATOS deployed sync**
- `study_assets_root/cogflow/interpreter/src/timelineCompiler.js`
- `study_assets_root/cogflow_clone/interpreter/src/timelineCompiler.js`
- `study_assets_root/cogflow_clone/cogflow-interpreter-app/src/timelineCompiler.js`

---

## 2026-03-07 — Survey slider UX + schema-aligned data

### Survey slider questions now show selected value

- **Symptom**: Slider questions moved, but participants could not see the exact numeric value they had selected.
- **Fix**: Slider questions now render a live-updating numeric value label adjacent to the slider.

**Interpreter file changed**
- `json-interpreter-app/src/jspsych-survey-response.js`

**JATOS deployed sync**
- `jatos_win_java/study_assets_root/cogflow/interpreter/src/jspsych-survey-response.js`
- `jatos_win_java/study_assets_root/cogflow-test/interpreter/src/jspsych-survey-response.js`

---

## 2026-03-07 — SART payload cleanup (single correctness field)

- **Symptom**: SART trials emitted multiple duplicate correctness fields (`correct`, `accuracy`, `correctness`).
- **Fix**: Restrict SART trial payload to a single correctness field: `correct`.

**Interpreter file changed**
- `json-interpreter-app/src/jspsych-sart.js`

**JATOS deployed sync**
- `jatos_win_java/study_assets_root/cogflow/interpreter/src/jspsych-sart.js`
- `jatos_win_java/study_assets_root/cogflow-test/interpreter/src/jspsych-sart.js`

## 2026-03 (early) — Task plugin fixes (SART / PVT / Continuous N-back)

### SART: key filtering + data cleanup + layout stability

- **Interpreter file changed**
  - `json-interpreter-app/src/jspsych-sart.js`

### PVT: theme-readable feedback + HTML feedback

- **Interpreter file changed**
  - `json-interpreter-app/src/jspsych-pvt.js`

### Continuous N-back: feedback timing + JATOS centering

- **Interpreter files changed**
  - `json-interpreter-app/src/jspsych-nback-continuous.js`
  - `json-interpreter-app/index_jatos.html`

---

## Notes

- JATOS sync entries mean the same patch was applied into `jatos_win_java/study_assets_root/*` so local JATOS runs use the fixed code.
