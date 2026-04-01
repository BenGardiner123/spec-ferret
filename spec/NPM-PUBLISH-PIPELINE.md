# NPM-PUBLISH-PIPELINE.MD

The definitive spec for getting `@specferret/cli` and `@specferret/core` onto npm
and keeping them there correctly. If something is not in this document, it is not
supported behaviour.

---

## What We Are Publishing

Two packages. Published to npm under the `@specferret` org scope.

| Package            | Command  | Purpose                                                              |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `@specferret/core` | —        | Engine. Store, extractor, validator, reconciler. Importable library. |
| `@specferret/cli`  | `ferret` | CLI. Thin wrapper over core. What developers install globally.       |

Developers run: `bun install -g @specferret/cli`
That one command is the entire install experience.
It must work on the first try. No exceptions.

---

## Monorepo Structure Required

The current repo has everything in one flat structure.
Before publish, it must be split into the two-package monorepo layout
specified in CLAUDE.md:

```
packages/
  core/
    src/
      store/
      extractor/
      context/
      reconciler/
      config.ts
      index.ts
    package.json
    tsconfig.json
  cli/
    bin/
      commands/
        init.ts
        scan.ts
        lint.ts
      ferret.ts
    package.json
    tsconfig.json
package.json          (workspace root)
README.md
LICENSE
```

---

## Package Specifications

### @specferret/core — package.json

```json
{
  "name": "@specferret/core",
  "version": "0.1.0",
  "description": "SpecFerret core engine — spec drift detection.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "bun": "./src/index.ts",
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist/", "README.md", "LICENSE"],
  "scripts": {
    "build": "bun ../../scripts/clean-dist.ts dist && tsc --project tsconfig.build.json",
    "test": "bun test"
  },
  "dependencies": {
    "ajv": "^8.12.0",
    "ajv-formats": "^2.1.1",
    "glob": "^13.0.6",
    "gray-matter": "^4.0.3",
    "zod": "^3.22.4"
  },
  "engines": { "bun": ">=1.0.0" },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/BenGardiner123/specferret.git"
  },
  "homepage": "https://specferret.dev"
}
```

### @specferret/cli — package.json

```json
{
  "name": "@specferret/cli",
  "version": "0.1.0",
  "description": "SpecFerret keeps your specs honest.",
  "type": "module",
  "bin": { "ferret": "./dist/bin/ferret.js" },
  "files": ["dist/", "README.md", "LICENSE"],
  "scripts": {
    "build": "bun ../../scripts/clean-dist.ts dist && tsc --project tsconfig.build.json",
    "test": "bun test"
  },
  "dependencies": {
    "@specferret/core": "0.1.0",
    "commander": "^14.0.3",
    "glob": "^13.0.6",
    "picocolors": "^1.1.1"
  },
  "engines": { "bun": ">=1.0.0" },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/BenGardiner123/specferret.git"
  },
  "homepage": "https://specferret.dev"
}
```

### Workspace root — package.json

```json
{
  "name": "specferret-workspace",
  "private": true,
  "workspaces": ["packages/core", "packages/cli"],
  "scripts": {
    "build": "bun run --filter '*' build",
    "test": "bun test",
    "publish:core": "cd packages/core && npm publish --access public",
    "publish:cli": "cd packages/cli && npm publish --access public"
  }
}
```

---

## Build Pipeline

We compile TypeScript to JavaScript before publishing.
npm receives compiled JS + `.d.ts` type declarations. Not raw TypeScript.

### Why

npm consumers may not be using Bun or TypeScript. The published package
must still install cleanly from the npm registry, but SpecFerret itself runs on Bun.
The published artifact relies on Bun's built-in `bun:sqlite` support and requires
`bun` to be installed.

### tsconfig.build.json (per package)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": false
  },
  "exclude": ["**/*.test.ts", "node_modules", "dist"]
}
```

### Build output check — required before every publish

```bash
# From packages/core
bun run build
ls dist/          # must contain index.js, index.d.ts, all source maps

# From packages/cli
bun run build
ls dist/bin/      # must contain ferret.js with correct shebang
bun dist/bin/ferret.js --version   # must print 0.1.0
```

---

## The Shebang Problem

`dist/bin/ferret.js` must begin with:

```
#!/usr/bin/env bun
```

Not `#!/usr/bin/env node`. Bun is the runtime contract.

The compiled output is allowed to depend on Bun APIs.
Audit compiled `dist/bin/ferret.js` before publish and confirm the shebang is correct.

---

## npm Org Setup

**Required before first publish:**

1. Create npm org `@specferret` at npmjs.com — Ben owns this account
2. Confirm `@specferret/core` and `@specferret/cli` package names are not taken
3. Generate a publish token: npmjs.com → Account → Access Tokens → Granular token
   - Scope: `@specferret/*`
   - Permission: Read and Write
   - Expiry: 365 days
4. Store token as `NPM_TOKEN` in GitHub repo secrets — do not put it in the codebase

---

## GitHub Actions — CI/CD Pipeline

Two workflows. One for CI (every push). One for publish (on release tag).

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.11

      - run: bun install

      - run: bun test

      - name: Performance gate
        run: |
          mkdir -p /tmp/ferret-gate
          cd /tmp/ferret-gate
          bun $GITHUB_WORKSPACE/packages/cli/dist/bin/ferret.js init --no-hook
          time bun $GITHUB_WORKSPACE/packages/cli/dist/bin/ferret.js lint
        # Must complete in under 500ms. If this step takes >1s something is wrong.

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.11

      - run: bun install
      - run: bun run build

      - name: Smoke test compiled CLI
        run: bun packages/cli/dist/bin/ferret.js --version
```

### `.github/workflows/publish.yml`

```yaml
name: Publish

on:
  push:
    tags:
      - "v*"

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write # for npm provenance

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.11

      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"

      - run: bun install

      - run: bun test
        name: Tests must pass before publish

      - run: bun run build

      - name: Smoke test compiled CLI
        run: bun packages/cli/dist/bin/ferret.js --version

      - name: Publish @specferret/core
        run: cd packages/core && npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish @specferret/cli
        run: cd packages/cli && npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Provenance** (`--provenance`) links the published package to the exact
GitHub commit it was built from. Developers can verify the package was not
tampered with. Boris approves this. Use it.

---

## Release Process — Step by Step

This is the exact sequence every time we publish. No shortcuts.

```
1. bun test                         all tests green
2. bun run build                    both packages compile cleanly
3. bun packages/cli/dist/bin/ferret.js --version   prints correct version
4. bun install -g ./packages/cli    install locally from disk
5. ferret --version                 prints correct version from global install
6. ferret init (fresh dir)          scaffolds correctly
7. ferret lint                      exits 0, under 500ms, no SQLite warning noise
8. git tag v0.1.0
9. git push origin v0.1.0           triggers publish workflow
10. watch GitHub Actions            both packages publish green
11. bun install -g @specferret/cli  install from npm (not local)
12. ferret --version                final smoke test from npm registry
```

Do not announce on HN until step 12 passes.

---

## Version Strategy

`0.1.0` for launch. Semver from day one.

| Change                     | Version bump         |
| -------------------------- | -------------------- |
| Breaking CLI or API change | Major (1.0.0, 2.0.0) |
| New command or feature     | Minor (0.2.0, 0.3.0) |
| Bug fix, doc update        | Patch (0.1.1, 0.1.2) |

Both packages version in lockstep for Sprint 1 and 2.
They may diverge in Sprint 3 when core stabilises independently.

---

## Packaging Boundary

Do not add `.npmignore` files unless publish inspection proves the `files` allowlist is insufficient.

For Sprint 1 the package boundary is:

- `@specferret/core`: `dist/`, `README.md`, `LICENSE`
- `@specferret/cli`: `dist/`, `README.md`, `LICENSE`

---

## Worklist — Ordered, No Skipping

### Pre-Publish (Do These First)

- [ ] **W01** — Create `@specferret` org on npmjs.com (Ben — 5 min)
- [ ] **W02** — Confirm package names `@specferret/core` and `@specferret/cli` are unclaimed (Ben — 2 min)
- [ ] **W03** — Generate npm publish token, store as `NPM_TOKEN` in GitHub secrets (Ben — 10 min)
- [ ] **W04** — Create `specferret` GitHub org, transfer repo into it (Ben — 15 min)

### Monorepo Restructure (Todd + Bruno)

- [x] **W05** — Create `packages/core/` and `packages/cli/` directory structure
- [x] **W06** — Move core source files into `packages/core/src/`
- [x] **W07** — Move CLI files into `packages/cli/bin/`
- [x] **W08** — Write `packages/core/package.json` per spec above
- [x] **W09** — Write `packages/cli/package.json` per spec above
- [x] **W10** — Write workspace root `package.json` per spec above
- [x] **W11** — Write `tsconfig.build.json` for each package
- [x] **W12** — Verify `files` allowlists publish only `dist/`, `README.md`, and `LICENSE`
- [x] **W13** — Update all internal imports to use `@specferret/core` in CLI package
- [x] **W14** — `bun install` — confirm workspace links resolve correctly

### Build Verification (Bruno)

- [x] **W15** — `bun test` — all tests still green after restructure
- [x] **W16** — `bun run build` — both packages compile without errors
- [x] **W17** — Confirm `dist/bin/ferret.js` shebang is `#!/usr/bin/env bun`
- [x] **W18** — `bun packages/cli/dist/bin/ferret.js --version` prints `0.1.0`
- [x] **W19** — `bun install -g ./packages/cli` — global install from disk works
- [x] **W20** — `ferret init` in a fresh temp directory — scaffolds correctly
- [x] **W21** — `ferret lint` in that directory — exits 0, under 500ms, with clean stderr

### Missing Test Coverage (Bruno + Inzaghi)

- [x] **W22** — Write `init.test.ts` — covers S01 acceptance criteria
- [x] **W23** — Write `lint.test.ts` — covers S07 acceptance criteria including `--ci` JSON shape
- [x] **W24** — `bun test` — 42 tests become 62 tests (20 new CLI), all green

### CI/CD (Todd)

- [x] **W25** — Write `.github/workflows/ci.yml` per spec above
- [x] **W26** — Write `.github/workflows/publish.yml` per spec above
- [x] **W27** — Push to GitHub, confirm CI workflow runs green on main branch

### Launch Publish (Ben)

- [x] **W28** — Run full release sequence steps 1–7 locally (dry run)
- [x] **W29** — `git tag v0.1.0 && git push origin v0.1.0`
- [ ] **W30** — Watch publish workflow complete — both packages green
- [ ] **W31** — `bun install -g @specferret/cli` from registry — smoke test
- [ ] **W32** — `ferret --version` from global registry install — final gate

**HN post goes live only after W32 passes.**

---

## What Can Go Wrong — Known Risks

| Risk                   | Mitigation                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Stale compiled output  | Run `bun run build` before release checks so `dist/` matches the current Bun source tree. |
| Package name squatting | Check W02 immediately — if names are taken, decision needed before any other work.        |
| Bun runtime missing    | Keep `bun` in `engines`, preserve the Bun shebang, and verify the compiled CLI under Bun. |

---

_© Laser Unicorn — MIT License_
