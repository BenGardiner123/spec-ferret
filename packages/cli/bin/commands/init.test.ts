import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach, afterEach } from 'bun:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ferretBin = path.resolve(__dirname, '../ferret.ts');

function runInit(cwd: string, args: string[] = ['--no-hook']): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [ferretBin, 'init', ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 10_000,
  });
}

describe('ferret init — S01 acceptance criteria', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferret-init-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 0 on a clean run', () => {
    const result = runInit(tmpDir);
    assert.equal(result.status, 0);
  });

  it('creates .ferret/graph.db silently', () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.ferret', 'graph.db')));
  });

  it('creates contracts/ directory if it does not exist', () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, 'contracts')));
  });

  it('writes contracts/example.contract.md with valid ferret frontmatter', () => {
    runInit(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, 'contracts', 'example.contract.md'), 'utf-8');
    assert.ok(content.includes('ferret:'), 'missing ferret: block');
    assert.ok(content.includes('id:'), 'missing id field');
    assert.ok(content.includes('type:'), 'missing type field');
    assert.ok(content.includes('shape:'), 'missing shape field');
  });

  it('writes ferret.config.json with correct defaults', () => {
    runInit(tmpDir);
    const raw = fs.readFileSync(path.join(tmpDir, 'ferret.config.json'), 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    assert.equal(config.specDir, 'contracts/');
    assert.equal(typeof config.filePattern, 'string');
    assert.equal(config.store, 'sqlite');
  });

  it('writes CLAUDE.md containing the context.json instruction', () => {
    runInit(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('context.json'), 'CLAUDE.md missing context.json reference');
  });

  it('writes canonical agent rules source in project space', () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'specferret', 'canonical-agent-rules.md')), 'missing canonical agent rules source');
    assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'instructions', 'specferret-agent.instructions.md')), 'missing generated instruction pack');
    assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'specferret', 'adapters', 'claude.adapter.md')), 'missing Claude adapter artifact');
    assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'specferret', 'adapters', 'copilot.adapter.md')), 'missing Copilot adapter artifact');
    assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'specferret', 'adapters', 'gemini.adapter.md')), 'missing Gemini adapter artifact');
  });

  it('generated agent content includes lifecycle and lint/review gate expectations', () => {
    runInit(tmpDir);

    const canonical = fs.readFileSync(path.join(tmpDir, '.github', 'specferret', 'canonical-agent-rules.md'), 'utf-8');
    const pack = fs.readFileSync(path.join(tmpDir, '.github', 'instructions', 'specferret-agent.instructions.md'), 'utf-8');

    assert.ok(canonical.includes('Contract Lifecycle'));
    assert.ok(canonical.includes('needs-review'));
    assert.ok(canonical.includes('Run `ferret lint`'));
    assert.ok(canonical.includes('ferret review'));

    assert.ok(pack.includes('ferret lint'));
    assert.ok(pack.includes('ferret review'));
    assert.ok(pack.includes('accept'));
    assert.ok(pack.includes('update'));
    assert.ok(pack.includes('reject'));
  });

  it('sends all output to stdout — stderr is empty on a clean run', () => {
    const result = runInit(tmpDir);
    assert.equal(result.stderr, '');
    assert.ok(result.stdout.length > 0);
  });

  it('is idempotent — running twice does not overwrite contracts/example.contract.md', () => {
    runInit(tmpDir);

    const examplePath = path.join(tmpDir, 'contracts', 'example.contract.md');
    const sentinel = '# sentinel — must survive second init';
    fs.writeFileSync(examplePath, sentinel, 'utf-8');

    runInit(tmpDir);

    const content = fs.readFileSync(examplePath, 'utf-8');
    assert.equal(content, sentinel);
  });

  it("second run prints 'Already initialised.' and exits 0", () => {
    runInit(tmpDir);
    const second = runInit(tmpDir);
    assert.equal(second.status, 0);
    assert.ok(second.stdout.includes('Already initialised.'), `expected 'Already initialised.' but got: ${second.stdout}`);
  });

  it('--no-hook skips pre-commit hook installation and still exits 0', () => {
    const result = runInit(tmpDir, ['--no-hook']);
    assert.equal(result.status, 0);
  });

  it('--no-agent-rules skips canonical rule scaffolding and still exits 0', () => {
    const result = runInit(tmpDir, ['--no-hook', '--no-agent-rules']);
    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(path.join(tmpDir, '.github', 'specferret', 'canonical-agent-rules.md')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, '.github', 'instructions', 'specferret-agent.instructions.md')), false);
  });

  it('is idempotent for canonical rules scaffolding', () => {
    runInit(tmpDir);

    const canonicalPath = path.join(tmpDir, '.github', 'specferret', 'canonical-agent-rules.md');
    const sentinelCanonical = '# sentinel canonical rules';
    fs.writeFileSync(canonicalPath, sentinelCanonical, 'utf-8');

    const packPath = path.join(tmpDir, '.github', 'instructions', 'specferret-agent.instructions.md');
    const sentinelPack = '# sentinel instruction pack';
    fs.writeFileSync(packPath, sentinelPack, 'utf-8');

    runInit(tmpDir);

    assert.equal(fs.readFileSync(canonicalPath, 'utf-8'), sentinelCanonical);
    assert.equal(fs.readFileSync(packPath, 'utf-8'), sentinelPack);
  });

  it('adapter generation is deterministic across reruns', () => {
    runInit(tmpDir);

    const claudePath = path.join(tmpDir, '.github', 'specferret', 'adapters', 'claude.adapter.md');
    const copilotPath = path.join(tmpDir, '.github', 'specferret', 'adapters', 'copilot.adapter.md');
    const geminiPath = path.join(tmpDir, '.github', 'specferret', 'adapters', 'gemini.adapter.md');

    const first = {
      claude: fs.readFileSync(claudePath, 'utf-8'),
      copilot: fs.readFileSync(copilotPath, 'utf-8'),
      gemini: fs.readFileSync(geminiPath, 'utf-8'),
    };

    runInit(tmpDir);

    const second = {
      claude: fs.readFileSync(claudePath, 'utf-8'),
      copilot: fs.readFileSync(copilotPath, 'utf-8'),
      gemini: fs.readFileSync(geminiPath, 'utf-8'),
    };

    assert.equal(first.claude, second.claude);
    assert.equal(first.copilot, second.copilot);
    assert.equal(first.gemini, second.gemini);
  });

  it('regeneration updates existing managed adapter files safely', () => {
    runInit(tmpDir);

    const canonicalPath = path.join(tmpDir, '.github', 'specferret', 'canonical-agent-rules.md');
    const canonicalBefore = fs.readFileSync(canonicalPath, 'utf-8');
    const canonicalAfter = `${canonicalBefore}\n- Adapter regeneration marker for tests.`;
    fs.writeFileSync(canonicalPath, canonicalAfter, 'utf-8');

    const claudePath = path.join(tmpDir, '.github', 'specferret', 'adapters', 'claude.adapter.md');
    const before = fs.readFileSync(claudePath, 'utf-8');

    runInit(tmpDir);

    const after = fs.readFileSync(claudePath, 'utf-8');
    assert.notEqual(before, after);
    assert.ok(after.includes('Adapter regeneration marker for tests.'));
  });

  it('does not overwrite unmanaged adapter files during regeneration', () => {
    runInit(tmpDir);

    const claudePath = path.join(tmpDir, '.github', 'specferret', 'adapters', 'claude.adapter.md');
    const sentinel = '# unmanaged adapter content';
    fs.writeFileSync(claudePath, sentinel, 'utf-8');

    const result = runInit(tmpDir);

    assert.equal(result.status, 0);
    assert.equal(fs.readFileSync(claudePath, 'utf-8'), sentinel);
    assert.ok(result.stdout.includes('claude.adapter.md  skipped-unmanaged'));
  });

  it('unsupported agent targets fail with clear message', () => {
    const result = runInit(tmpDir, ['--no-hook', '--agent-targets', 'claude,unknown']);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /unsupported agent targets/);
    assert.match(result.stderr, /Supported targets: claude, copilot, gemini/);
  });

  it('scaffolds .claude/rules/ferret rules files', () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'rules', 'ferret', 'enforcement.md')), 'missing enforcement.md');
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'rules', 'ferret', 'contract-authoring.md')), 'missing contract-authoring.md');
    const authoring = fs.readFileSync(path.join(tmpDir, '.claude', 'rules', 'ferret', 'contract-authoring.md'), 'utf-8');
    assert.ok(authoring.includes('api'), 'missing api type');
    assert.ok(authoring.includes('table'), 'missing table type');
    assert.ok(authoring.includes('event'), 'missing event type');
    assert.ok(authoring.includes('$ref'), 'missing unsupported keyword reference');
  });

  it('scaffolds .claude/skills/ferret skill files', () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'ferret', 'write-contract', 'SKILL.md')), 'missing write-contract SKILL.md');
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'ferret', 'resolve-drift', 'SKILL.md')), 'missing resolve-drift SKILL.md');
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'ferret', 'extract-contract', 'SKILL.md')), 'missing extract-contract SKILL.md');
    const writeSkill = fs.readFileSync(path.join(tmpDir, '.claude', 'skills', 'ferret', 'write-contract', 'SKILL.md'), 'utf-8');
    assert.ok(writeSkill.includes('ferret-write-contract'), 'missing skill frontmatter name');
    assert.ok(writeSkill.includes('api.POST/auth/login'), 'missing api example');
    assert.ok(writeSkill.includes('tables.user'), 'missing table example');
    assert.ok(writeSkill.includes('events.user.created'), 'missing event example');
  });

  it('scaffolds .claude/agents/ferret-author.md', () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'ferret-author.md')), 'missing ferret-author.md');
    const agent = fs.readFileSync(path.join(tmpDir, '.claude', 'agents', 'ferret-author.md'), 'utf-8');
    assert.ok(agent.includes('ferret-author'), 'missing agent name');
    assert.ok(agent.includes('context.json'), 'missing context.json instruction');
  });

  it('scaffolds .claude/commands slash-entry files', () => {
    runInit(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'commands', 'ferret-write.md')), 'missing ferret-write.md');
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'commands', 'ferret-review.md')), 'missing ferret-review.md');
  });

  it('--no-agent-rules skips .claude/ scaffolding', () => {
    runInit(tmpDir, ['--no-hook', '--no-agent-rules']);
    assert.equal(fs.existsSync(path.join(tmpDir, '.claude', 'rules', 'ferret', 'enforcement.md')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'ferret', 'write-contract', 'SKILL.md')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'ferret-author.md')), false);
  });

  it('.claude/ skill and agent files are not overwritten on second init', () => {
    runInit(tmpDir);
    const skillPath = path.join(tmpDir, '.claude', 'skills', 'ferret', 'write-contract', 'SKILL.md');
    const sentinel = '# sentinel skill content';
    fs.writeFileSync(skillPath, sentinel, 'utf-8');
    runInit(tmpDir);
    assert.equal(fs.readFileSync(skillPath, 'utf-8'), sentinel);
  });

  it('CLAUDE.md includes six contract types and skill pointers', () => {
    runInit(tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('api'), 'missing api type');
    assert.ok(content.includes('table'), 'missing table type');
    assert.ok(content.includes('event'), 'missing event type');
    assert.ok(content.includes('write-contract'), 'missing skill pointer');
    assert.ok(content.includes('ferret-author'), 'missing agent pointer');
  });
});
