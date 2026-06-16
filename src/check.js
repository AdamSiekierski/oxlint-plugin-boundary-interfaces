#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  findContext,
  getAliases,
  isInside,
  loadJson,
  matchesEntry,
  resolveSpecifier,
  stripExt,
} from './lib.js';

// Repo scan: warn for public interface entries that no *other* context imports.
// Per-file linting can't see repo-wide usage, so this lives outside the oxlint rule.

const projectRoot = process.cwd();
const scanRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(projectRoot, 'src');
const manifestName = 'interface.json';
const aliases = getAliases(projectRoot);

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);
// ponytail: regex import scan; misses computed/dynamic specifiers. Fine for static ESM imports.
const IMPORT_RE =
  /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir, onFile) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

const usedByContext = new Map(); // contextRoot -> Set of context-relative paths (no ext)
const manifests = []; // absolute interface.json paths

walk(scanRoot, (file) => {
  if (path.basename(file) === manifestName) {
    manifests.push(file);
    return;
  }
  if (!SOURCE_EXTS.has(path.extname(file))) return;

  const importerDir = path.dirname(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2];
    const target = resolveSpecifier(spec, importerDir, projectRoot, aliases);
    if (!target) continue;
    const ctx = findContext(target, projectRoot, manifestName);
    if (!ctx || isInside(file, ctx.root)) continue; // external, ungoverned, or same-context
    const rel = stripExt(path.relative(ctx.root, target)).split(path.sep).join('/');
    if (!usedByContext.has(ctx.root)) usedByContext.set(ctx.root, new Set());
    usedByContext.get(ctx.root).add(rel);
  }
});

let problems = 0;
for (const manifest of manifests) {
  const root = path.dirname(manifest);
  const publicList = loadJson(manifest)?.public ?? [];
  const used = usedByContext.get(root) ?? new Set();
  const usedArr = [...used];

  for (const entry of publicList) {
    const ok = usedArr.some((u) => matchesEntry(entry, u));
    if (!ok) {
      problems++;
      console.warn(
        `${path.relative(projectRoot, manifest)}: public entry '${entry}' is not imported by any other context.`,
      );
    }
  }
}

if (problems === 0) console.log('boundary-interfaces: all public entries are used.');
process.exit(problems > 0 ? 1 : 0);
