import path from 'node:path';
import {
  findContext,
  getAliases,
  isInside,
  matchesPublic,
  resolveSpecifier,
  stripExt,
} from './lib.js';

const DEFAULT_EXEMPT = ['/__tests__/', '/__fixtures__/'];

const rule = {
  meta: {
    docs: {
      description:
        'Disallow importing a bounded context (a folder with interface.json) from outside, unless the path is listed in its public interface.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          manifestName: { type: 'string' },
          exemptImporters: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const opts = context.options?.[0] ?? {};
    const manifestName = opts.manifestName ?? 'interface.json';
    const exempt = opts.exemptImporters ?? DEFAULT_EXEMPT;
    const projectRoot = context.cwd;
    const importer = context.physicalFilename || context.filename;
    const importerNorm = importer.split(path.sep).join('/');

    if (exempt.some((s) => importerNorm.includes(s))) return {};

    const aliases = getAliases(projectRoot);
    const importerDir = path.dirname(importer);

    function check(node, source) {
      if (!node || typeof source !== 'string') return;
      const target = resolveSpecifier(source, importerDir, projectRoot, aliases);
      if (!target) return;
      const ctx = findContext(target, projectRoot, manifestName);
      if (!ctx) return; // not a governed context — gradual rollout
      if (isInside(importer, ctx.root)) return; // same context

      const rel = path.relative(ctx.root, target);
      if (matchesPublic(rel, ctx.publicList)) return;

      context.report({
        node,
        message: `'${source}' reaches into bounded context '${path.basename(ctx.root)}', but '${stripExt(rel).split(path.sep).join('/')}' is not in its ${manifestName} public list.`,
      });
    }

    return {
      ImportDeclaration(node) {
        check(node.source, node.source?.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node.source, node.source.value);
      },
      ExportAllDeclaration(node) {
        check(node.source, node.source?.value);
      },
      ImportExpression(node) {
        if (node.source?.type === 'Literal') check(node.source, node.source.value);
      },
    };
  },
};

const plugin = {
  meta: { name: 'boundary-interfaces' },
  rules: { 'boundary-interfaces': rule },
};

export default plugin;
