# @specferret/core

Core engine for SpecFerret contract extraction, validation, graph reconciliation, and drift analysis.

[![npm version](https://img.shields.io/npm/v/@specferret/core)](https://www.npmjs.com/package/@specferret/core)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

## What this package is for

`@specferret/core` is the runtime library behind the CLI. Use it when you want to embed SpecFerret behavior in scripts, custom tooling, or internal workflows.

It includes:

- Store implementations (`sqlite`; postgres on roadmap)
- Frontmatter extraction and schema validation
- Reconciler logic for direct/transitive impact
- Context graph generation utilities

## Install

```bash
npm i @specferret/core
```

## Runtime requirements

- Bun 1.0+

SpecFerret core is Bun-first and uses Bun-compatible runtime behavior.

## Typical consumers

- Internal platform tooling that needs drift checks in-process
- CI wrappers that need machine-readable drift metadata
- Custom developer workflows on top of SpecFerret reconciliation data

## Validation status

Core behavior is validated through the Sprint 5 external branch-matrix harness (spec-kit + BMAD), including explicit assertions for:

- S40 transitive depth thresholds
- S41 review proof artifacts
- S42 extract determinism

Latest green runs:

- spec-kit: https://github.com/BenGardiner123/spec-ferret-validation-spec-kit/actions/runs/23962649755
- BMAD: https://github.com/BenGardiner123/specferret-validation-bmad/actions/runs/23962652352

## Looking for the CLI?

Install `@specferret/cli` if you want the end-user command interface:

```bash
bun install -g @specferret/cli
```

## Links

- Source: https://github.com/BenGardiner123/spec-ferret
- Docs: https://specferret.dev
- CLI package: https://www.npmjs.com/package/@specferret/cli
