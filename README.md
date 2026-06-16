# oxlint-plugin-boundary-interfaces

Enforce architectural boundaries with a per-folder public interface.

**A folder containing an `interface.json` is a bounded context.** Code outside that folder may
only import the paths the manifest lists; everything else in the folder is internal. A folder with
no `interface.json` is unrestricted — so you adopt one context at a time.

Generic: no hardcoded directory layout or alias. Import specifiers are resolved with the project's
`tsconfig.json` `compilerOptions.paths`, plus normal relative resolution.

## The manifest — `interface.json`

```json
{ "public": ["hooks/useGraphConfig", "values/*", "lib/**"] }
```

Paths are relative to the folder, without extension.

- exact — `hooks/useGraphConfig`
- `/*` — one level (`values/source`, not `values/nested/x`)
- `/**` — any depth

## Rule — `boundary-interfaces/boundary-interfaces`

When a file outside a context imports a path not in that context's `public` list, it reports a
diagnostic. Same-context imports are never checked. Nested contexts work: the nearest ancestor
`interface.json` defines the boundary.

### oxlint

```jsonc
// .oxlintrc.json
{
  "jsPlugins": [
    { "name": "boundary-interfaces", "specifier": "oxlint-plugin-boundary-interfaces" }
  ],
  "rules": {
    "boundary-interfaces/boundary-interfaces": "warn"
  }
}
```

### Options

```jsonc
["warn", {
  "manifestName": "interface.json",                 // default
  "exemptImporters": ["/__tests__/", "/__fixtures__/"] // importer-path substrings exempt from the rule
}]
```

## Dead-public check — `boundary-interfaces-check`

Per-file linting can't tell whether a public path is used *anywhere else*. This CLI scans the repo
and warns for any `public` entry that no other context imports (dead public surface). Exits non-zero
on findings — wire it into CI / pre-push.

```bash
boundary-interfaces-check          # scans ./src
boundary-interfaces-check packages # scans a given root
```

## License

MIT
