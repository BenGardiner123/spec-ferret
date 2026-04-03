# SpecFerret Action Output Contract (`BenGardiner123/action`)

This document defines stable outputs emitted by the reusable action.

## Output Fields

- `exit-code`
  - Type: integer string
  - Meaning: process-style exit code from `ferret lint --ci`
  - Expected values:
    - `0`: no drift and no integrity failures
    - `1`: drift detected
    - `2`: configuration/integrity/error condition

- `consistent`
  - Type: boolean string (`true`/`false`)
  - Meaning: whether graph state is consistent according to CI lint result

- `breaking`
  - Type: integer string
  - Meaning: direct breaking item count

- `non-breaking`
  - Type: integer string
  - Meaning: transitive/non-breaking item count

- `flagged`
  - Type: integer string
  - Meaning: total flagged impact entries

- `output-json-path`
  - Type: filesystem path
  - Meaning: runner-local path to captured `ferret lint --ci` JSON

- `output-stderr-path`
  - Type: filesystem path
  - Meaning: runner-local path to captured stderr output

## Compatibility Rules (v1)

- Existing output names are stable in `v1`.
- New outputs may be added in `v1` if they do not rename/remove existing outputs.
- Rename/remove of existing outputs requires a new major version.

## Consumer Notes

- Treat all values as strings in workflow expressions.
- Convert numeric outputs explicitly in scripts when needed.
- If JSON parsing fails in-action, summary includes parser diagnostics and `consistent=false`.
