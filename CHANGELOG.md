# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed
- Align contract type semantics across runtime and docs: `ferret.type` now uses a strict six-type model (`api`, `table`, `type`, `event`, `flow`, `config`) in both extractor behavior and documentation.
- Document migration guidance for legacy frontmatter type values such as `schema`, `service`, and `model`.

### Notes
- If a contract does not fit a core type, select the closest core type and open an issue to propose expansion of the core type set.
