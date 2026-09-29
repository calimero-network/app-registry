/**
 * Repository hygiene: CI workflows, CLI dependencies and api/lib modules.
 *
 * - Third-party actions are pinned to a full commit SHA (with a `# tag`
 *   comment), so a moved tag cannot change what CI runs.
 * - `${{ }}` expressions never appear inside a `run:` script; values reach
 *   the shell through `env:` instead.
 * - In a workflow that runs for pull requests, a job holding a write scope
 *   only runs for pushes, and checkouts do not persist the token.
 * - Every dependency the CLI declares is imported by the CLI.
 * - Every module in api/lib is required by deployed code.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '../../..');
const WORKFLOWS_DIR = path.join(ROOT, '.github/workflows');

// cli-release.yml is being removed separately; it is not held to these rules.
const SKIPPED_WORKFLOWS = new Set(['cli-release.yml']);

function loadWorkflows() {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter(f => /\.ya?ml$/.test(f) && !SKIPPED_WORKFLOWS.has(f))
    .map(file => {
      const text = fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8');
      return { file, text, doc: yaml.load(text) };
    });
}

function* steps(doc) {
  for (const [jobId, job] of Object.entries(doc.jobs || {})) {
    for (const step of job.steps || []) yield { jobId, job, step };
  }
}

function triggers(doc) {
  const on = doc.on ?? doc[true]; // YAML 1.1 may read a bare `on` as true
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return on;
  return Object.keys(on || {});
}

const workflows = loadWorkflows();

describe('CI workflows', () => {
  it('found workflows to check', () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it('pins every third-party action to a commit SHA with a tag comment', () => {
    const offenders = [];
    for (const { file, text } of workflows) {
      for (const line of text.split('\n')) {
        const m = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/);
        if (!m) continue;
        const ref = m[1];
        if (ref.startsWith('./') || ref.startsWith('docker://')) continue;
        const owner = ref.split('/')[0];
        if (owner === 'actions' || owner === 'github') continue;
        const pinned = /@[0-9a-f]{40}$/.test(ref) && /^\s+#\s*\S+/.test(m[2]);
        if (!pinned) offenders.push(`${file}: ${ref}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps ${{ }} expressions out of run scripts', () => {
    const offenders = [];
    for (const { file, doc } of workflows) {
      for (const { jobId, step } of steps(doc)) {
        if (typeof step.run === 'string' && step.run.includes('${{')) {
          offenders.push(`${file}: ${jobId} / ${step.name || step.run}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  describe.each(
    workflows.filter(({ doc }) =>
      triggers(doc).some(t => String(t).startsWith('pull_request'))
    )
  )('$file (runs for pull requests)', ({ doc }) => {
    it('grants write scopes only to jobs that run on push', () => {
      const offenders = [];
      for (const [jobId, job] of Object.entries(doc.jobs)) {
        const perms = job.permissions || {};
        const writes =
          perms === 'write-all' ||
          Object.values(perms).some(v => v === 'write');
        if (!writes) continue;
        const cond = String(job.if || '');
        if (!/github\.event_name\s*==\s*'push'/.test(cond)) {
          offenders.push(jobId);
        }
      }
      expect(offenders).toEqual([]);
    });

    it('does not persist the token on checkout', () => {
      const offenders = [];
      for (const { jobId, step } of steps(doc)) {
        if (!String(step.uses || '').startsWith('actions/checkout@')) continue;
        if (!step.with || step.with['persist-credentials'] !== false) {
          offenders.push(jobId);
        }
      }
      expect(offenders).toEqual([]);
    });
  });
});

describe('CLI dependencies', () => {
  const CLI = path.join(ROOT, 'packages/cli');

  // Declared but not imported yet; listed so the check can hold for the rest.
  const KNOWN_UNUSED = ['@fastify/cors', 'table'];

  function sources(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sources(full));
      else if (/\.(c?js|mjs|ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  const code = ['src', 'scripts']
    .flatMap(d => sources(path.join(CLI, d)))
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n');

  function imported(name) {
    const q = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const spec = `['"]${q}(?:/[^'"]*)?['"]`;
    return new RegExp(
      `(?:from\\s+${spec}|require\\(\\s*${spec}\\s*\\)|import\\(\\s*${spec}\\s*\\)|import\\s+${spec})`
    ).test(code);
  }

  const { dependencies = {} } = JSON.parse(
    fs.readFileSync(path.join(CLI, 'package.json'), 'utf8')
  );

  it('imports every declared dependency', () => {
    const unused = Object.keys(dependencies).filter(
      d => !KNOWN_UNUSED.includes(d) && !imported(d)
    );
    expect(unused).toEqual([]);
  });

  it('keeps the known-unused list current', () => {
    const stale = KNOWN_UNUSED.filter(d => !(d in dependencies) || imported(d));
    expect(stale).toEqual([]);
  });
});

describe('api/lib modules', () => {
  const DEPLOYED_DIRS = ['api', 'shared', 'packages/backend/src'];
  const LIB = path.join(ROOT, 'api/lib');

  function jsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...jsFiles(full));
      else if (/\.c?js$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  const required = new Set();
  for (const file of DEPLOYED_DIRS.flatMap(d => jsFiles(path.join(ROOT, d)))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const [, spec] of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      let target;
      if (spec.startsWith('#api-lib/')) {
        target = path.join(LIB, spec.slice('#api-lib/'.length));
      } else if (spec.startsWith('.')) {
        target = path.resolve(path.dirname(file), spec);
      } else continue;
      required.add(target.replace(/\.c?js$/, ''));
    }
  }

  it('requires every module from deployed code', () => {
    const orphans = fs
      .readdirSync(LIB)
      .filter(f => /\.c?js$/.test(f))
      .filter(f => !required.has(path.join(LIB, f).replace(/\.c?js$/, '')));
    expect(orphans).toEqual([]);
  });
});
