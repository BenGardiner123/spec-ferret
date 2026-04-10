#!/usr/bin/env bash
set -euo pipefail

manifest_path="${1:-SCENARIO-MANIFEST.json}"
cli_cmd="${2:-bun vendor/ferret.bundle.js}"

if ! test -f "$manifest_path"; then
  echo "Missing scenario manifest: $manifest_path" >&2
  exit 1
fi

mkdir -p artifacts

expected_exit_code="$(bun -e "const m = JSON.parse(await Bun.file(process.argv[1]).text()); console.log(String(m.expected?.exitCode ?? ''));" "$manifest_path")"
expected_drift_class="$(bun -e "const m = JSON.parse(await Bun.file(process.argv[1]).text()); console.log(String(m.expected?.driftClass ?? ''));" "$manifest_path")"
expected_review_required="$(bun -e "const m = JSON.parse(await Bun.file(process.argv[1]).text()); console.log(String(Boolean(m.expected?.reviewRequired)));" "$manifest_path")"

if [ -z "$expected_exit_code" ] || [ -z "$expected_drift_class" ]; then
  echo "Manifest must define expected.exitCode and expected.driftClass" >&2
  exit 1
fi

set +e
$cli_cmd lint --ci > artifacts/lint-ci.json
actual_exit_code=$?
set -e

if [ "$actual_exit_code" -ne "$expected_exit_code" ]; then
  echo "Scenario assertion failed: expected exit $expected_exit_code, got $actual_exit_code" >&2
  exit 1
fi

bun -e "
const fsPath = process.argv[1];
const expectedClass = process.argv[2];
const expectedReview = process.argv[3] === 'true';
const payload = JSON.parse(await Bun.file(fsPath).text());
const breaking = Number(payload.breaking ?? 0);
const nonBreaking = Number(payload.nonBreaking ?? 0);
const upwardDrift = Array.isArray(payload.upwardDrift) ? payload.upwardDrift : [];
const upwardBreaking = upwardDrift.filter(d => d.driftClass === 'BREAKING').length;
const upwardNonBreaking = upwardDrift.filter(d => d.driftClass === 'NON_BREAKING').length;

if (expectedClass === 'clean' && (breaking !== 0 || nonBreaking !== 0 || upwardDrift.length !== 0)) {
  throw new Error('Expected clean drift class but JSON reports drift.');
}

if (expectedClass === 'breaking' && breaking <= 0) {
  throw new Error('Expected breaking drift class but breaking count is not > 0.');
}

if (expectedClass === 'non-breaking' && (breaking !== 0 || nonBreaking <= 0)) {
  throw new Error('Expected non-breaking drift class but counts do not match.');
}

if (expectedClass === 'upward-breaking' && upwardBreaking <= 0) {
  throw new Error('Expected upward breaking drift but upwardDrift BREAKING count is ' + upwardBreaking + '.');
}

if (expectedClass === 'upward-non-breaking' && upwardNonBreaking <= 0) {
  throw new Error('Expected upward non-breaking drift but upwardDrift NON_BREAKING count is ' + upwardNonBreaking + '.');
}

const reviewRequiredInPayload = Boolean(breaking > 0 || upwardBreaking > 0);
if (expectedReview !== reviewRequiredInPayload) {
  throw new Error('Expected reviewRequired does not match inferred review requirement from breaking counts.');
}
" artifacts/lint-ci.json "$expected_drift_class" "$expected_review_required"

echo "Scenario assertion passed for $manifest_path"
