# RELEASE-GATE-CHECKLIST.MD

Release-readiness checklist for enforcement correctness, performance, and agent UX.
Run this before any candidate publish or GA sign-off.

---

## Scope

This checklist is required for all release candidates that change:

- drift detection or classification behavior
- `ferret lint --ci` machine output
- `ferret review --json` machine output
- docs that define CI or agent workflows

---

## 1) Performance Thresholds (Required)

### Lint performance gate

Run on a clean representative repo:

```bash
ferret lint --perf-budget-ms 500
```

Pass criteria:

- Command exits `0`
- No performance budget error is emitted
- Summary reports clean state with runtime in milliseconds

### Extract performance gate

Run on a representative codebase:

```bash
ferret extract --perf-budget-ms 2000
```

Pass criteria:

- Command exits `0`
- No performance budget error is emitted
- Summary reports extraction runtime in milliseconds

---

## 2) CI JSON Schema Validation (Required)

Validate that both machine outputs still satisfy the documented contracts.

### Lint CI payload

Run:

```bash
ferret lint --ci > lint-ci.json
```

Validate required keys and stable diagnostics schema marker:

```bash
cat lint-ci.json | jq -e '.version and (.consistent | type == "boolean") and .breaking and .nonBreaking and .flagged and .timestamp and .diagnosticsSchemaVersion'
```

### Review JSON payload

Run:

```bash
ferret review --json > review.json
```

Validate required keys including versioned review contract:

```bash
cat review.json | jq -e '.version and .diagnosticsSchemaVersion and .reviewable and .selected and (.action == null or .action) and (.result == null or .result)'
```

Pass criteria:

- Both validation commands exit `0`
- Payloads remain machine-parseable with expected version fields present

---

## 3) Docs/Runtime Consistency Check (Required)

Ensure user-facing docs match current runtime behavior.

1. Verify command docs and examples in `README.md` match actual CLI behavior for:
   - `ferret lint --ci`
   - `ferret review --json`
2. Verify JSON sample artifacts are aligned with live output version fields:
   - `docs/ci-templates/ferret-lint-ci-sample.json`
   - `docs/ci-templates/ferret-review-json-sample.json`
3. Verify any newly introduced payload fields are documented with agent-consumption guidance.

Pass criteria:

- No stale flags/options in docs
- No missing/incorrect JSON version markers in docs samples
- Agent workflow guidance reflects the actual output contract

---

## 4) Evidence Capture (Required)

Record in PR description or release notes:

- commands executed
- pass/fail outcomes
- runtime values for lint/extract gates
- links to CI runs validating machine outputs

No evidence means no release sign-off.

---

_© Laser Unicorn — MIT License_
