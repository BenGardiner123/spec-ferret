import assert from 'node:assert/strict';
import { describe, it } from 'bun:test';
import { extractFromSpecFile } from './frontmatter.js';
import { CONTRACT_TYPES } from './contract-types.js';

const VALID_SPEC = `---
ferret:
  id: api.GET/users
  type: api
  shape:
    response:
      type: array
      items:
        type: object
        properties:
          id:
            type: string
            format: uuid
          name:
            type: string
        required: [id, name]
---

# Users Endpoint

Returns all users.
`;

const SPEC_WITH_IMPORTS = `---
ferret:
  id: api.GET/search
  type: api
  shape:
    response:
      type: array
      items:
        type: string
  imports:
    - auth.jwt
    - tables.document
---
`;

const SPEC_WITH_UNSUPPORTED_KEYWORD = `---
ferret:
  id: tables.user
  type: table
  shape:
    type: object
    allOf:
      - type: string
    properties:
      id:
        type: string
---
`;

const SPEC_NO_FRONTMATTER = `# Just a markdown file

No frontmatter here. Ferret should skip this.
`;

const SPEC_MISSING_FIELDS = `---
ferret:
  id: api.GET/broken
  type: api
---
`;

const SPEC_INVALID_TYPE = `---
ferret:
  id: api.GET/broken
  type: service
  shape:
    type: object
---
`;

describe('extractFromSpecFile — Task 3', () => {
  it('extracts valid frontmatter correctly', () => {
    const result = extractFromSpecFile('contracts/users.contract.md', VALID_SPEC);
    assert.equal(result.filePath, 'contracts/users.contract.md');
    assert.equal(result.fileType, 'spec');
    assert.equal(result.extractedBy, 'gray-matter');
    assert.equal(result.warning, undefined);
    assert.equal(result.contracts.length, 1);
    assert.equal(result.contracts[0].id, 'api.GET/users');
    assert.equal(result.contracts[0].type, 'api');
    assert.notEqual(result.contracts[0].shape_hash, undefined);
    assert.equal(result.contracts[0].shape_hash.length, 64);
    assert.deepEqual(result.contracts[0].imports, []);
  });

  it('extracts imports correctly', () => {
    const result = extractFromSpecFile('contracts/search.contract.md', SPEC_WITH_IMPORTS);
    assert.deepEqual(result.contracts[0].imports, ['auth.jwt', 'tables.document']);
  });

  it('missing frontmatter returns warning, empty contracts, does not throw', () => {
    const result = extractFromSpecFile('contracts/plain.contract.md', SPEC_NO_FRONTMATTER);
    assert.equal(result.warning, 'no-frontmatter');
    assert.equal(result.contracts.length, 0);
    assert.equal(result.filePath, 'contracts/plain.contract.md');
    assert.equal(result.fileType, 'spec');
  });

  it('missing required field "shape" throws with field name in message', () => {
    assert.throws(() => extractFromSpecFile('contracts/broken.contract.md', SPEC_MISSING_FIELDS), /shape/);
  });

  it('missing multiple required fields throws with all field names in message', () => {
    const specMissingAll = `---\nferret:\n  someField: value\n---\n`;
    assert.throws(() => extractFromSpecFile('contracts/broken.contract.md', specMissingAll), /id.*type.*shape|Missing required/);
  });

  it('invalid top-level contract type throws and lists allowed values', () => {
    assert.throws(
      () => extractFromSpecFile('contracts/broken.contract.md', SPEC_INVALID_TYPE),
      /Invalid contract type 'service'.*Allowed types: api, table, type, event, flow, config/,
    );
  });

  it('unsupported schema keyword produces warning, does not fail', () => {
    const stderrOutput: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    // Capture stderr writes
    process.stderr.write = (chunk: any) => {
      stderrOutput.push(String(chunk));
      return true;
    };

    let result: ReturnType<typeof extractFromSpecFile> | undefined;
    try {
      result = extractFromSpecFile('contracts/complex.contract.md', SPEC_WITH_UNSUPPORTED_KEYWORD);
    } finally {
      process.stderr.write = originalWrite;
    }

    assert.notEqual(result, undefined);
    assert.equal(result!.contracts.length, 1);
    assert.equal(result!.warning, undefined);
    assert.equal(
      stderrOutput.some((line) => line.includes('allOf')),
      true,
    );
  });

  it('all six allowed types are accepted without error', () => {
    for (const contractType of CONTRACT_TYPES) {
      const spec = `---
ferret:
  id: test.${contractType}
  type: ${contractType}
  shape:
    type: object
---
`;
      assert.doesNotThrow(() => extractFromSpecFile(`contracts/${contractType}.contract.md`, spec));
    }
  });

  it('extraction is synchronous — the function itself has no async/await', () => {
    // If extractFromSpecFile returns a Promise, this would be a thenable object
    const result = extractFromSpecFile('contracts/users.contract.md', VALID_SPEC);
    assert.equal(result instanceof Promise, false);
    assert.notEqual(typeof (result as any).then, 'function');
  });

  it('identical files produce identical shape_hash', () => {
    const r1 = extractFromSpecFile('contracts/a.contract.md', VALID_SPEC);
    const r2 = extractFromSpecFile('contracts/b.contract.md', VALID_SPEC);
    assert.equal(r1.contracts[0].shape_hash, r2.contracts[0].shape_hash);
  });

  it('different shapes produce different shape_hash', () => {
    const specA = VALID_SPEC;
    const specB = specA.replace('format: uuid', 'format: email');
    const r1 = extractFromSpecFile('contracts/a.contract.md', specA);
    const r2 = extractFromSpecFile('contracts/b.contract.md', specB);
    assert.notEqual(r1.contracts[0].shape_hash, r2.contracts[0].shape_hash);
  });

  it('property order change in shape does NOT change shape_hash', () => {
    const specA = `---
ferret:
  id: api.GET/test
  type: api
  shape:
    type: object
    properties:
      id:
        type: string
      name:
        type: string
    required: [id, name]
---
`;
    const specB = `---
ferret:
  id: api.GET/test
  type: api
  shape:
    type: object
    properties:
      name:
        type: string
      id:
        type: string
    required: [id, name]
---
`;
    const r1 = extractFromSpecFile('contracts/a.contract.md', specA);
    const r2 = extractFromSpecFile('contracts/b.contract.md', specB);
    // Keys are sorted before hashing — order change is a no-change
    assert.equal(r1.contracts[0].shape_hash, r2.contracts[0].shape_hash);
  });
});

describe('extractFromSpecFile — S50 source block', () => {
  const SPEC_WITH_SOURCE = `---
ferret:
  id: auth.jwt
  type: type
  source:
    file: src/auth/jwt.ts
    symbol: JwtPayload
  shape:
    type: object
    properties:
      sub:
        type: string
    required: [sub]
---
`;

  const SPEC_WITHOUT_SOURCE = `---
ferret:
  id: auth.jwt
  type: type
  shape:
    type: object
    properties:
      sub:
        type: string
    required: [sub]
---
`;

  it('parses source.file and source.symbol when present', () => {
    const result = extractFromSpecFile('contracts/auth/jwt.contract.md', SPEC_WITH_SOURCE);
    assert.equal(result.contracts.length, 1);
    assert.equal(result.contracts[0].sourceFile, 'src/auth/jwt.ts');
    assert.equal(result.contracts[0].sourceSymbol, 'JwtPayload');
  });

  it('has undefined sourceFile and sourceSymbol when source block absent', () => {
    const result = extractFromSpecFile('contracts/auth/jwt.contract.md', SPEC_WITHOUT_SOURCE);
    assert.equal(result.contracts.length, 1);
    assert.equal(result.contracts[0].sourceFile, undefined);
    assert.equal(result.contracts[0].sourceSymbol, undefined);
  });

  it('ignores source block with non-string fields gracefully', () => {
    const specBadSource = `---
ferret:
  id: auth.jwt
  type: type
  source:
    file: 42
    symbol: [not, a, string]
  shape:
    type: object
---
`;
    const result = extractFromSpecFile('contracts/auth/jwt.contract.md', specBadSource);
    assert.equal(result.contracts[0].sourceFile, undefined);
    assert.equal(result.contracts[0].sourceSymbol, undefined);
  });

  it('source block does not affect shape_hash', () => {
    const r1 = extractFromSpecFile('contracts/a.contract.md', SPEC_WITH_SOURCE);
    const r2 = extractFromSpecFile('contracts/b.contract.md', SPEC_WITHOUT_SOURCE);
    assert.equal(r1.contracts[0].shape_hash, r2.contracts[0].shape_hash);
  });

  it('identical source blocks produce identical shape_hash (deterministic snapshot)', () => {
    const r1 = extractFromSpecFile('contracts/a.contract.md', SPEC_WITH_SOURCE);
    const r2 = extractFromSpecFile('contracts/b.contract.md', SPEC_WITH_SOURCE);
    assert.equal(r1.contracts[0].shape_hash, r2.contracts[0].shape_hash);
  });
});

describe('extractFromSpecFile — S62 contractStatus mapping', () => {
  it('no status field → contractStatus is "pending"', () => {
    const spec = `---
ferret:
  id: api.no-status
  type: api
  shape:
    type: object
---
`;
    const result = extractFromSpecFile('contracts/no-status.contract.md', spec);
    assert.equal(result.contracts[0].contractStatus, 'pending');
  });

  it('status: active → contractStatus is "stable"', () => {
    const spec = `---
ferret:
  id: api.active
  type: api
  status: active
  shape:
    type: object
---
`;
    const result = extractFromSpecFile('contracts/active.contract.md', spec);
    assert.equal(result.contracts[0].contractStatus, 'stable');
  });

  it('status: complete → contractStatus is "stable"', () => {
    const spec = `---
ferret:
  id: api.complete
  type: api
  status: complete
  shape:
    type: object
---
`;
    const result = extractFromSpecFile('contracts/complete.contract.md', spec);
    assert.equal(result.contracts[0].contractStatus, 'stable');
  });

  it('status: pending → contractStatus is "pending"', () => {
    const spec = `---
ferret:
  id: api.pending
  type: api
  status: pending
  shape:
    type: object
---
`;
    const result = extractFromSpecFile('contracts/pending.contract.md', spec);
    assert.equal(result.contracts[0].contractStatus, 'pending');
  });

  it('unknown status value → contractStatus defaults to "pending"', () => {
    const spec = `---
ferret:
  id: api.unknown
  type: api
  status: some-unknown-value
  shape:
    type: object
---
`;
    const result = extractFromSpecFile('contracts/unknown.contract.md', spec);
    assert.equal(result.contracts[0].contractStatus, 'pending');
  });
});
