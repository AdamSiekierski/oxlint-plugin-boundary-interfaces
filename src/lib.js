import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const jsonCache = new Map();
const aliasCache = new Map();

/** Tolerant JSON read (handles tsconfig comments + trailing commas). Cached. Returns null on failure. */
export function loadJson(file) {
  if (jsonCache.has(file)) return jsonCache.get(file);
  let result = null;
  try {
    const txt = readFileSync(file, 'utf8')
      // ponytail: naive JSONC strip; swap for a JSON5 parser if a real tsconfig breaks it.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1');
    result = JSON.parse(txt);
  } catch {
    result = null;
  }
  jsonCache.set(file, result);
  return result;
}

/** Alias map from the project's tsconfig `compilerOptions.paths`. Cached per project root. */
export function getAliases(projectRoot) {
  if (aliasCache.has(projectRoot)) return aliasCache.get(projectRoot);
  const json = loadJson(path.join(projectRoot, 'tsconfig.json'));
  const co = json?.compilerOptions ?? {};
  const baseUrl = co.baseUrl ? path.resolve(projectRoot, co.baseUrl) : projectRoot;
  const out = [];
  for (const [key, vals] of Object.entries(co.paths ?? {})) {
    if (!Array.isArray(vals) || vals.length === 0) continue;
    out.push({
      prefix: key.replace(/\*$/, ''),
      target: path.resolve(baseUrl, vals[0].replace(/\*$/, '')),
    });
  }
  out.sort((a, b) => b.prefix.length - a.prefix.length); // longest prefix wins
  aliasCache.set(projectRoot, out);
  return out;
}

/** Resolve an import specifier to an absolute path, or null for external/bare packages. */
export function resolveSpecifier(specifier, importerDir, projectRoot, aliases) {
  if (specifier.startsWith('.')) return path.resolve(importerDir, specifier);
  for (const { prefix, target } of aliases) {
    if (specifier === prefix.replace(/\/$/, '')) return target;
    if (specifier.startsWith(prefix)) return path.resolve(target, specifier.slice(prefix.length));
  }
  return null;
}

export function stripExt(p) {
  return p.replace(/\.(m|c)?(ts|tsx|js|jsx)$/, '').replace(/\/index$/, '');
}

/** Walk up from a target file to the nearest ancestor dir holding `manifestName`. */
export function findContext(targetPath, projectRoot, manifestName) {
  let dir = path.dirname(targetPath);
  while (true) {
    const manifest = path.join(dir, manifestName);
    if (existsSync(manifest)) {
      return { root: dir, publicList: loadJson(manifest)?.public ?? [] };
    }
    if (dir === projectRoot) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function isInside(file, dir) {
  const rel = path.relative(dir, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Compile a glob entry to a RegExp: `*` matches within a path segment, `**` matches across `/`. */
function entryToRegex(entry) {
  const clean = stripExt(entry.replace(/\/+$/, ''));
  const pattern = clean
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials (not `*` or `/`)
    .replace(/\*\*/g, '\0') // ** -> placeholder
    .replace(/\*/g, '[^/]*') // * -> one segment
    .replace(/\0/g, '.*'); // placeholder -> any depth
  return new RegExp('^' + pattern + '$');
}

/** Does a context-relative path (no extension) match a single public entry? */
export function matchesEntry(entry, relPath) {
  const p = stripExt(relPath).split(path.sep).join('/');
  return entryToRegex(entry).test(p);
}

/** Does a context-relative path match any entry in the public allow-list? */
export function matchesPublic(relPath, publicList) {
  return publicList.some((entry) => matchesEntry(entry, relPath));
}
