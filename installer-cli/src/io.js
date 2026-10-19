import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * A syntactically valid skill/rule id — the token that names a skill directory or a
 * `<id>.<ext>` rule file. Removal is driven by the install record in version-check.json, but
 * every id is re-checked against this pattern before it becomes a path, so a corrupted or
 * hand-edited record can never traverse out of the target directory (no `/`, `\`, or `..`).
 */
export const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * A syntactically valid skill FILE key — the manifest's `skill.files` key, which becomes a
 * path under the skill directory (`SKILL.md`, `references/deep.md`).
 *
 * `SAFE_ID` guards the skill id only; the file keys went straight into `path.join` unchecked.
 * That was harmless while every key was a bare filename, but the moment the manifest builder
 * started emitting nested keys, an id like `../../.bashrc` in a hostile or corrupted manifest
 * would have written outside the skills directory. Segments are `SAFE_ID` plus an optional
 * single dot-extension, joined by `/` — so `..`, absolute paths, backslashes, drive letters
 * and empty segments are all rejected by construction rather than by blacklist.
 */
export const SAFE_REL_PATH = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?(\/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?)*$/;

/**
 * Throws unless `key` is a safe relative path. Call this before a manifest-supplied key
 * becomes part of a filesystem path.
 *
 * @param {string} key
 * @param {string} skillId  for the error message
 */
export function assertSafeRelPath(key, skillId) {
  if (typeof key !== 'string' || !SAFE_REL_PATH.test(key)) {
    throw new Error(`skill '${skillId}': unsafe file path in manifest: ${JSON.stringify(key)}`);
  }
}

/** Writes file content to localPath, creating parent directories as needed. */
export function writeContentFile(localPath, content) {
  const dir = path.dirname(localPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(localPath, content, 'utf-8');
}

/**
 * Writes one skill's files under `skillsDir/<id>/`, and is the ONLY place that does so.
 *
 * Six call sites used to inline this loop (claude, cursor, codex, antigravity, androidstudio,
 * update), which meant two divergences: only `update` dropped the old directory first, and
 * NONE of them validated the manifest's file keys before handing them to `path.join`. That
 * was harmless while every key was a bare filename; once the manifest builder emits nested
 * keys (`references/deep.md`), an unvalidated key is a path-traversal write.
 *
 * Clean-sync (rm the directory first) is the behaviour worth keeping from `update`: without
 * it, a file removed upstream lingers forever on an existing install. That matters most
 * exactly when a skill is reorganised — a monolithic `SKILL.md` split into a spine plus
 * `references/` would otherwise leave the superseded files behind, and the agent would read
 * both.
 *
 * An unsafe id is skipped (it names no skill we shipped). An unsafe FILE key throws: that is
 * a corrupt or hostile manifest, and continuing would write outside the skills directory.
 *
 * @param {string} skillsDir
 * @param {{id: string, files: Record<string,string>}} skill
 * @returns {boolean} whether the skill was written
 */
export function writeSkillFiles(skillsDir, skill) {
  if (!skill || typeof skill.id !== 'string' || !SAFE_ID.test(skill.id)) return false;
  const destDir = path.join(skillsDir, skill.id);
  rmSync(destDir, { recursive: true, force: true });
  for (const [fileKey, content] of Object.entries(skill.files ?? {})) {
    assertSafeRelPath(fileKey, skill.id);
    writeContentFile(path.join(destDir, fileKey), content);
  }
  return true;
}

/**
 * Removes the named weegloo **skill directories** — one subdirectory per id under `skillsDir`.
 * `ids` is the stale set computed by the install-record diff (previously installed, not
 * installed now); each is deleted recursively. The ids come from OUR own version-check.json
 * record, so a user-authored skill is never in the set; each is still re-checked against
 * SAFE_ID (path-traversal guard) before becoming a path, and only existing directories count.
 *
 * @param {string} skillsDir
 * @param {string[]} ids  stale skill ids to remove
 * @returns {string[]} ids that existed and were removed
 */
export function removeSkillDirs(skillsDir, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  if (!existsSync(skillsDir)) return [];
  const removed = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) continue;
    const dir = path.join(skillsDir, id);
    if (!existsSync(dir)) continue;
    rmSync(dir, { recursive: true, force: true });
    removed.push(id);
  }
  return removed;
}

/**
 * Removes the named weegloo **rule files** — `<id>.<ext>` under `rulesDir` — for the
 * file-per-rule agents (Claude `.md`, Cursor `.mdc`). Same record-driven, SAFE_ID-guarded,
 * existence-checked contract as `removeSkillDirs`. Marker-embedded rules (Codex / Antigravity
 * / Android Studio) use `removeRuleMarkers` (codex.js) instead.
 *
 * @param {string} rulesDir
 * @param {string[]} ids  stale rule ids to remove
 * @param {string} ext    rule file extension, with or without the leading dot
 * @returns {string[]} ids that existed and were removed
 */
export function removeRuleFiles(rulesDir, ids, ext) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  if (!existsSync(rulesDir)) return [];
  const suffix = ext.startsWith('.') ? ext : `.${ext}`;
  const removed = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) continue;
    const file = path.join(rulesDir, `${id}${suffix}`);
    if (!existsSync(file)) continue;
    rmSync(file, { force: true });
    removed.push(id);
  }
  return removed;
}

/**
 * Disk-detection helpers for the update flow. Detection is a cheap `weegloo-` prefix scan —
 * deliberately NOT catalog-limited, because the catalog needs the branch ref, the ref needs the
 * stamp, and a pre-migration install has no stamp (a circular dependency the prefix scan breaks).
 * DESTRUCTIVE operations must then intersect these ids with a real catalog before acting, so a
 * user-authored `weegloo-foo` that happens to share the prefix is never touched.
 */

/** Directory names under `skillsDir` that look like weegloo skills (prefix scan). */
export function listWeeglooSkillDirs(skillsDir) {
  if (!existsSync(skillsDir)) return [];
  try {
    return readdirSync(skillsDir).filter((name) => {
      if (!name.startsWith('weegloo-') || !SAFE_ID.test(name)) return false;
      try {
        return statSync(path.join(skillsDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/** Rule ids present as `<id>.<ext>` files under `rulesDir` (Claude `.md`, Cursor `.mdc`). */
export function listWeeglooRuleFiles(rulesDir, ext) {
  if (!existsSync(rulesDir)) return [];
  const suffix = ext.startsWith('.') ? ext : `.${ext}`;
  try {
    return readdirSync(rulesDir)
      .filter((name) => name.startsWith('weegloo-') && name.endsWith(suffix))
      .map((name) => name.slice(0, -suffix.length))
      .filter((id) => SAFE_ID.test(id));
  } catch {
    return [];
  }
}

/** Rule ids present as `<!-- weegloo:<id> -->` marker sections inside a context file. */
export function listWeeglooRuleMarkers(contextFilePath) {
  if (!existsSync(contextFilePath)) return [];
  try {
    const body = readFileSync(contextFilePath, 'utf-8');
    const ids = [];
    for (const match of body.matchAll(/<!-- weegloo:([A-Za-z0-9_-]+) -->/g)) {
      if (!ids.includes(match[1])) ids.push(match[1]);
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * The npx spec the upload server is launched with. The `@latest` tag is what keeps it current:
 * npx serves a BARE name from the first copy it ever cached under `_npx/<hash>/` and never asks
 * the registry again (npm 9 libnpmexec: a `*` range matches any cached version), so a config
 * written as `weegloo-upload` stayed on whatever version was current on that machine's first
 * launch — a year-old 1.0.4 surviving every release, reconnect and re-auth. A tag spec makes
 * npx resolve the tag against the registry on every launch and install the new version when it
 * differs.
 */
export const UPLOAD_PACKAGE_SPEC = 'weegloo-upload@latest';

/** The bare launch arg older installs wrote (and still sit in users' configs). */
const BARE_UPLOAD_SPEC = 'weegloo-upload';

/** The TOML table holding the codex upload server's `args` (its `.env` sub-table is separate). */
const UPLOAD_TOML_SECTION = 'mcp_servers.weegloo-upload';

/**
 * stdio launch command for the local `weegloo-upload` MCP server.
 *
 * With `injectPath` (set when the target runs inside a GUI host such as Xcode
 * Intelligence), the `env.PATH` is pinned to the bin directory of the node
 * running this installer. GUI-hosted MCP clients spawn servers with the bare
 * login PATH (`/usr/bin:/bin`), where nvm/homebrew node installs are invisible,
 * so bare `npx` fails with ENOENT and the server's tools silently never appear.
 * PATH (not an absolute `command`) is enough on its own: it covers both locating
 * `npx` and npx's own `#!/usr/bin/env node` shebang lookup. Terminal-launched
 * agents don't need it, so it is omitted unless `injectPath` is set. Note the PATH
 * embeds this node's version dir — re-run the installer after a node upgrade.
 *
 * On Windows, `npx` resolves to `npx.cmd`, which an MCP client that spawns the
 * process without a shell cannot execute directly — it fails with ENOENT. Routing
 * it through `cmd /c` runs the shim via the command interpreter, and `npx.cmd`
 * locates node.exe next to itself, so no PATH injection is needed there.
 *
 * The package is launched as UPLOAD_PACKAGE_SPEC (`@latest`), never the bare name — see above.
 *
 * @param {{ injectPath?: boolean, execPath?: string, platform?: NodeJS.Platform }} [opts] injectable for tests
 * @returns {{ command: string, args: string[], env: Record<string, string> }}
 */
export function uploadServerCommand({
  injectPath = false,
  execPath = process.execPath,
  platform = process.platform,
} = {}) {
  if (platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'npx', '-y', UPLOAD_PACKAGE_SPEC], env: {} };
  }

  const env = {};
  if (injectPath) {
    const binDir = path.dirname(execPath);
    env.PATH = `${binDir}:/usr/bin:/bin`;
  }
  return { command: 'npx', args: ['-y', UPLOAD_PACKAGE_SPEC], env };
}

/**
 * Makes an EXISTING `weegloo-upload` MCP entry launch UPLOAD_PACKAGE_SPEC — the update flow's one
 * MCP edit. Installs before the switch wrote the bare name, and an update otherwise never touches
 * MCP config, so without this every existing install would stay pinned to its cached copy until
 * a full reinstall.
 *
 * Deliberately narrow: only an args element that is EXACTLY the bare name is rewritten. No entry
 * is created (an MCP-less install stays MCP-less), the `weegloo` server, `env` and any token are
 * left alone, and an entry the user pinned on purpose (`weegloo-upload@1.5.0`, a local path) is
 * not ours to change. The file is written only when something actually changes.
 *
 * Status: `absent` (no file / no entry), `current` (nothing bare to rewrite), `migrated`
 * (rewritten), `failed` (unreadable / unparseable / unwritable — `error` says why).
 *
 * @param {{ kind: 'json'|'toml', file: string, container?: string } | null} mcp  same descriptor as stores.js
 * @returns {{ status: 'absent'|'current'|'migrated'|'failed', file: string|null, error?: string }}
 */
export function pinUploadServerToLatest(mcp) {
  const file = mcp?.file ?? null;
  if (!file || !existsSync(file)) return { status: 'absent', file };
  try {
    const text = readFileSync(file, 'utf-8');

    if (mcp.kind === 'toml') {
      const lines = text.split(/\r?\n/);
      const eol = text.includes('\r\n') ? '\r\n' : '\n';
      let found = false;
      let changed = false;
      let inSection = false;
      for (let i = 0; i < lines.length; i++) {
        const header = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
        if (header) {
          inSection = header[1].trim() === UPLOAD_TOML_SECTION;
          found ||= inSection;
          continue;
        }
        if (!inSection || !/^\s*args\s*=/.test(lines[i])) continue;
        const next = lines[i].replace(/(["'])weegloo-upload\1/g, `$1${UPLOAD_PACKAGE_SPEC}$1`);
        if (next !== lines[i]) {
          lines[i] = next;
          changed = true;
        }
      }
      if (!found) return { status: 'absent', file };
      if (!changed) return { status: 'current', file };
      writeFileSync(file, lines.join(eol), 'utf-8');
      return { status: 'migrated', file };
    }

    const config = JSON.parse(text);
    const entry = config?.[mcp.container ?? 'mcpServers']?.['weegloo-upload'];
    if (!entry || typeof entry !== 'object') return { status: 'absent', file };
    if (!Array.isArray(entry.args) || !entry.args.includes(BARE_UPLOAD_SPEC)) {
      return { status: 'current', file };
    }
    entry.args = entry.args.map((arg) => (arg === BARE_UPLOAD_SPEC ? UPLOAD_PACKAGE_SPEC : arg));
    writeFileSync(file, JSON.stringify(config, null, 2), 'utf-8');
    return { status: 'migrated', file };
  } catch (err) {
    return { status: 'failed', file, error: err.message };
  }
}

/**
 * The line the update flow prints for a pinUploadServerToLatest result (uncoloured — callers
 * style it), or null when there is nothing to say. `warn` marks the failure case.
 *
 * @param {{ status: string, file: string|null, error?: string }} result
 * @returns {{ warn: boolean, text: string } | null}
 */
export function uploadPinNotice(result) {
  if (result?.status === 'migrated') {
    return {
      warn: false,
      text: `weegloo-upload now launches ${UPLOAD_PACKAGE_SPEC} (was stuck on its first cached copy) → ${result.file}; restart the agent to pick it up`,
    };
  }
  if (result?.status === 'failed') {
    return {
      warn: true,
      text: `Could not check weegloo-upload in ${result.file} (${result.error}). Make its args launch ${UPLOAD_PACKAGE_SPEC} by hand, or it stays on its first cached copy.`,
    };
  }
  return null;
}
