import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  findContext,
  getAliases,
  isInside,
  matchesPublic,
  resolveSpecifier,
  stripExt,
} from '../src/lib.js';

test('stripExt drops extensions and /index', () => {
  assert.equal(stripExt('hooks/useX.ts'), 'hooks/useX');
  assert.equal(stripExt('values/index.ts'), 'values');
  assert.equal(stripExt('hooks/useX'), 'hooks/useX');
});

test('matchesPublic: exact, /* one level, /** any depth', () => {
  const list = ['hooks/useGraphConfig', 'values/*', 'lib/**'];
  assert.equal(matchesPublic('hooks/useGraphConfig.ts', list), true);
  assert.equal(matchesPublic('hooks/useSecret', list), false);
  assert.equal(matchesPublic('values/source', list), true);
  assert.equal(matchesPublic('values/nested/deep', list), false); // /* is one level
  assert.equal(matchesPublic('lib/a/b/c', list), true); // /** is any depth
});

test('isInside', () => {
  assert.equal(isInside('/p/src/graph/x.ts', '/p/src/graph'), true);
  assert.equal(isInside('/p/src/library/x.ts', '/p/src/graph'), false);
  assert.equal(isInside('/p/src/graph', '/p/src/graph'), true);
});

test('resolveSpecifier: relative, alias, external', () => {
  const aliases = [{ prefix: '@/', target: '/p/src' }];
  assert.equal(resolveSpecifier('./a/b', '/p/src/graph', '/p', aliases), '/p/src/graph/a/b');
  assert.equal(resolveSpecifier('@/graph/hooks/x', '/p/src/lib', '/p', aliases), '/p/src/graph/hooks/x');
  assert.equal(resolveSpecifier('react', '/p/src/lib', '/p', aliases), null);
});

test('getAliases reads tsconfig paths', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bi-'));
  writeFileSync(
    path.join(root, 'tsconfig.json'),
    '{\n  // comment\n  "compilerOptions": { "paths": { "@/*": ["./src/*"] }, }\n}',
  );
  const aliases = getAliases(root);
  assert.deepEqual(aliases, [{ prefix: '@/', target: path.join(root, 'src') }]);
});

test('findContext walks to nearest interface.json', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bi-'));
  const graph = path.join(root, 'src', 'graph');
  mkdirSync(path.join(graph, 'hooks'), { recursive: true });
  writeFileSync(path.join(graph, 'interface.json'), '{ "public": ["hooks/usePublic"] }');

  const ctx = findContext(path.join(graph, 'hooks', 'usePublic.ts'), root, 'interface.json');
  assert.equal(ctx.root, graph);
  assert.deepEqual(ctx.publicList, ['hooks/usePublic']);

  assert.equal(findContext(path.join(root, 'src', 'lib', 'x.ts'), root, 'interface.json'), null);
});
