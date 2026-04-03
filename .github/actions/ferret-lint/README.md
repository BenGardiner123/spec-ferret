# SpecFerret Lint CI Action

Reusable composite action that runs `ferret lint --ci`, captures JSON output, publishes a workflow summary, uploads an artifact, and enforces the drift gate through exit code.

The action validates `baseline-mode`, captures stderr, and appends parser/stderr diagnostics into the workflow summary when CI output is malformed.

## Inputs

- `baseline-mode`: `committed` or `rebuild` (default: `committed`)
- `bun-version`: Bun version to install (default: `1.3.11`)
- `install-command`: command to install CLI packages (default: `bun add -g @specferret/core @specferret/cli`)
- `working-directory`: run directory (default: `.`)
- `include-suggestions`: include import suggestions (default: `false`)
- `artifact-name`: artifact name (default: `ferret-lint-ci`)

## Outputs

- `exit-code`
- `consistent`
- `breaking`
- `non-breaking`
- `flagged`
- `output-json-path`
- `output-stderr-path`

## Example

```yaml
- name: SpecFerret CI
  uses: BenGardiner123/action@v1
  with:
    baseline-mode: committed
```

## Release Governance

- Versioning policy: `docs/ci-templates/specferret-action-versioning-policy.md`
- Output contract: `docs/ci-templates/specferret-action-output-contract.md`
- Release checklist: `docs/ci-templates/specferret-action-release-checklist.md`
- In-repo smoke workflow: `.github/workflows/ferret-action-smoke.yml`
