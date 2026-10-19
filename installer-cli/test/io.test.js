import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  writeSkillFiles,
  removeSkillDirs,
  assertSafeRelPath,
  SAFE_REL_PATH,
  uploadServerCommand,
  pinUploadServerToLatest,
  uploadPinNotice,
  UPLOAD_PACKAGE_SPEC,
} from '../src/io.js';

/**
 * These cover the skill-directory DEPTH contract: a skill is no longer a flat bag of files but a
 * spine plus `references/`, and three separate flows have to agree on that — install writes the
 * nested files, a re-sync drops the ones upstream removed, uninstall takes the whole tree.
 *
 * `manifest.test.js` already asserts the BUILD side (a subdirectory yields nested keys). Nothing
 * asserted the WRITE side, which is the half that fails silently: a dropped `references/` file
 * leaves the spine pointing at a page that is not on disk, and a stale one leaves the agent
 * reading a superseded copy alongside the current one. Neither raises an error anywhere.
 */

const withTmp = (fn) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weegloo-io-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

/** Every file under `dir`, as sorted POSIX-relative paths. */
function tree(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const key = prefix ? `${prefix}/${e.name}` : e.name;
      return e.isDirectory() ? tree(path.join(dir, e.name), key) : [key];
    })
    .sort();
}

test('writeSkillFiles: nested manifest keys become nested files', () => {
  withTmp((root) => {
    const skillsDir = path.join(root, 'skills');
    const written = writeSkillFiles(skillsDir, {
      id: 'weegloo-x',
      files: {
        'SKILL.md': 'spine',
        'metadata.json': '{}',
        'references/a.md': 'A',
        'references/b.md': 'B',
      },
    });

    assert.equal(written, true);
    assert.deepEqual(tree(path.join(skillsDir, 'weegloo-x')), [
      'SKILL.md',
      'metadata.json',
      'references/a.md',
      'references/b.md',
    ]);
    assert.equal(fs.readFileSync(path.join(skillsDir, 'weegloo-x', 'references', 'a.md'), 'utf-8'), 'A');
  });
});

test('writeSkillFiles: clean-sync drops files AND directories the manifest no longer ships', () => {
  withTmp((root) => {
    const skillsDir = path.join(root, 'skills');
    writeSkillFiles(skillsDir, {
      id: 'weegloo-x',
      files: { 'SKILL.md': 'v1', 'references/a.md': 'A v1', 'references/gone.md': 'stale' },
    });
    // Upstream reorganises: `a.md` is renamed and `gone.md` is folded back into the spine.
    writeSkillFiles(skillsDir, {
      id: 'weegloo-x',
      files: { 'SKILL.md': 'v2', 'references/renamed.md': 'A v2' },
    });

    assert.deepEqual(tree(path.join(skillsDir, 'weegloo-x')), ['SKILL.md', 'references/renamed.md']);
    assert.equal(fs.readFileSync(path.join(skillsDir, 'weegloo-x', 'SKILL.md'), 'utf-8'), 'v2');
  });
});

test('writeSkillFiles: a skill that loses its references/ entirely leaves no empty directory', () => {
  withTmp((root) => {
    const skillsDir = path.join(root, 'skills');
    writeSkillFiles(skillsDir, { id: 'weegloo-x', files: { 'SKILL.md': 'v1', 'references/a.md': 'A' } });
    writeSkillFiles(skillsDir, { id: 'weegloo-x', files: { 'SKILL.md': 'v2' } });

    assert.equal(fs.existsSync(path.join(skillsDir, 'weegloo-x', 'references')), false);
  });
});

test('writeSkillFiles: an unsafe file key throws instead of writing outside the skill dir', () => {
  withTmp((root) => {
    const skillsDir = path.join(root, 'skills');
    assert.throws(
      () => writeSkillFiles(skillsDir, { id: 'weegloo-x', files: { '../../escaped.md': 'nope' } }),
      /unsafe file path/
    );
    assert.equal(fs.existsSync(path.join(root, 'escaped.md')), false);
    assert.equal(fs.existsSync(path.join(path.dirname(root), 'escaped.md')), false);
  });
});

test('writeSkillFiles: an unsafe skill id is skipped, not written', () => {
  withTmp((root) => {
    const skillsDir = path.join(root, 'skills');
    assert.equal(writeSkillFiles(skillsDir, { id: '../evil', files: { 'SKILL.md': 'x' } }), false);
    assert.deepEqual(tree(skillsDir), []);
  });
});

test('SAFE_REL_PATH: the key shapes the corpus may and may not use', () => {
  const accepted = ['SKILL.md', 'metadata.json', 'references/master-detail.md', 'references/UPPER_Case-1.md'];
  const rejected = [
    '../../.bashrc',
    'references/../../x.md',
    '/abs.md',
    'references\\win.md', // a Windows separator must not slip through as one segment
    'references/two.dots.md', // one dot-extension per segment — the builder rejects this at build time
    'references/with space.md',
    'references/한글.md',
    '',
  ];
  for (const key of accepted) assert.ok(SAFE_REL_PATH.test(key), `should accept ${JSON.stringify(key)}`);
  for (const key of rejected) assert.ok(!SAFE_REL_PATH.test(key), `should reject ${JSON.stringify(key)}`);
  assert.throws(() => assertSafeRelPath('references/../x.md', 'weegloo-x'), /unsafe file path/);
});

test('removeSkillDirs: takes the whole nested tree, and only the ids it was given', () => {
  withTmp((root) => {
    const skillsDir = path.join(root, 'skills');
    writeSkillFiles(skillsDir, { id: 'weegloo-x', files: { 'SKILL.md': 'x', 'references/a.md': 'A' } });
    writeSkillFiles(skillsDir, { id: 'weegloo-keep', files: { 'SKILL.md': 'k', 'references/b.md': 'B' } });

    assert.deepEqual(removeSkillDirs(skillsDir, ['weegloo-x', 'weegloo-never-installed']), ['weegloo-x']);
    assert.equal(fs.existsSync(path.join(skillsDir, 'weegloo-x')), false);
    assert.deepEqual(tree(path.join(skillsDir, 'weegloo-keep')), ['SKILL.md', 'references/b.md']);
  });
});

// ── weegloo-upload launch spec ───────────────────────────────────────────────
// A bare `npx -y weegloo-upload` is served from npx's first cached copy forever (no registry
// check), so a machine that first launched it a year ago keeps running that year-old version.
// The installer writes `@latest`, and installs/updates migrate the bare entries older installs left.

test('uploadServerCommand: every platform launches weegloo-upload@latest, never the bare name', () => {
  assert.equal(UPLOAD_PACKAGE_SPEC, 'weegloo-upload@latest');
  for (const platform of ['win32', 'darwin', 'linux']) {
    const { args } = uploadServerCommand({ platform });
    assert.equal(args.at(-1), 'weegloo-upload@latest', platform);
    assert.ok(!args.includes('weegloo-upload'), platform);
  }
});

test('pinUploadServerToLatest (json): bare arg → @latest, every other server and key kept', () => {
  withTmp((dir) => {
    const file = path.join(dir, 'mcp.json');
    const config = {
      projects: { '/p': { mcpServers: {} } },
      mcpServers: {
        weegloo: { type: 'http', url: 'https://ai.weegloo.com/mcp' },
        'weegloo-upload': { command: 'cmd', args: ['/c', 'npx', '-y', 'weegloo-upload'], env: { UPLOAD_API_URL: 'x' } },
        other: { command: 'node', args: ['weegloo-upload'] },
      },
    };
    fs.writeFileSync(file, JSON.stringify(config), 'utf-8');

    const res = pinUploadServerToLatest({ kind: 'json', file, container: 'mcpServers' });
    assert.equal(res.status, 'migrated');
    const after = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.deepEqual(after.mcpServers['weegloo-upload'].args, ['/c', 'npx', '-y', 'weegloo-upload@latest']);
    assert.deepEqual(after.mcpServers['weegloo-upload'].env, { UPLOAD_API_URL: 'x' });
    assert.deepEqual(after.mcpServers.weegloo, config.mcpServers.weegloo);
    assert.deepEqual(after.mcpServers.other, config.mcpServers.other, 'another server is never ours');
    assert.deepEqual(after.projects, config.projects);

    // Idempotent: nothing bare left → current, and the file is not rewritten.
    const before = fs.readFileSync(file, 'utf-8');
    assert.equal(pinUploadServerToLatest({ kind: 'json', file, container: 'mcpServers' }).status, 'current');
    assert.equal(fs.readFileSync(file, 'utf-8'), before);
  });
});

test('pinUploadServerToLatest (json): a deliberate pin, no entry, no file, corrupt file', () => {
  withTmp((dir) => {
    const file = path.join(dir, 'mcp.json');
    const mcp = { kind: 'json', file, container: 'mcpServers' };

    assert.equal(pinUploadServerToLatest(mcp).status, 'absent', 'no file');
    assert.equal(pinUploadServerToLatest(null).status, 'absent', 'no descriptor');

    fs.writeFileSync(file, JSON.stringify({ mcpServers: { weegloo: { url: 'u' } } }), 'utf-8');
    assert.equal(pinUploadServerToLatest(mcp).status, 'absent', 'no upload entry');

    const pinned = JSON.stringify({ mcpServers: { 'weegloo-upload': { command: 'npx', args: ['-y', 'weegloo-upload@1.5.0'] } } });
    fs.writeFileSync(file, pinned, 'utf-8');
    assert.equal(pinUploadServerToLatest(mcp).status, 'current', 'a user pin is not ours to change');
    assert.equal(fs.readFileSync(file, 'utf-8'), pinned);

    fs.writeFileSync(file, '{ not json', 'utf-8');
    const res = pinUploadServerToLatest(mcp);
    assert.equal(res.status, 'failed');
    assert.ok(res.error);
    assert.equal(fs.readFileSync(file, 'utf-8'), '{ not json', 'an unreadable file is left alone');
  });
});

test('pinUploadServerToLatest (toml): only the upload table args change, CRLF preserved', () => {
  withTmp((dir) => {
    const file = path.join(dir, 'config.toml');
    const lines = [
      '[mcp_servers.weegloo]',
      'url = "https://ai.weegloo.com/mcp"',
      '',
      '[mcp_servers.weegloo-upload]',
      'command = "cmd"',
      'args = ["/c", "npx", "-y", "weegloo-upload"]',
      '',
      '[mcp_servers.weegloo-upload.env]',
      'UPLOAD_API_URL = "x"',
      '',
      '[mcp_servers.other]',
      'args = ["weegloo-upload"]',
      '',
    ];
    fs.writeFileSync(file, lines.join('\r\n'), 'utf-8');

    const res = pinUploadServerToLatest({ kind: 'toml', file });
    assert.equal(res.status, 'migrated');
    const expected = [...lines];
    expected[5] = 'args = ["/c", "npx", "-y", "weegloo-upload@latest"]';
    assert.equal(fs.readFileSync(file, 'utf-8'), expected.join('\r\n'), 'one line changed, other table and CRLF kept');

    assert.equal(pinUploadServerToLatest({ kind: 'toml', file }).status, 'current');

    fs.writeFileSync(file, '[mcp_servers.weegloo]\nurl = "u"\n', 'utf-8');
    assert.equal(pinUploadServerToLatest({ kind: 'toml', file }).status, 'absent');
  });
});

test('uploadPinNotice: speaks only when something changed or could not be checked', () => {
  assert.equal(uploadPinNotice({ status: 'absent', file: null }), null);
  assert.equal(uploadPinNotice({ status: 'current', file: 'f' }), null);
  const migrated = uploadPinNotice({ status: 'migrated', file: 'f' });
  assert.equal(migrated.warn, false);
  assert.ok(migrated.text.includes('weegloo-upload@latest') && migrated.text.includes('f'));
  const failed = uploadPinNotice({ status: 'failed', file: 'f', error: 'boom' });
  assert.equal(failed.warn, true);
  assert.ok(failed.text.includes('boom'));
});
