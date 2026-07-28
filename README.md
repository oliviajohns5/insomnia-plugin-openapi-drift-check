# insomnia-plugin-openapi-drift-check

[![npm version](https://img.shields.io/npm/v/insomnia-plugin-openapi-drift-check.svg)](https://www.npmjs.com/package/insomnia-plugin-openapi-drift-check)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Local-only OpenAPI drift reports for Insomnia.

OpenAPI Drift Check compares Insomnia request routes to a JSON OpenAPI/Swagger spec found in the workspace export and reports undocumented requests, missing spec operations, method mismatches, and duplicate request routes.

## Why

Exports and importers already exist. This plugin answers a different question:

```text
Do the requests in my Insomnia workspace still match my OpenAPI contract?
```

## Features

- Finds JSON OpenAPI/Swagger specs inside the workspace export
- Compares `METHOD /path` routes against Insomnia requests
- Reports Insomnia requests missing from the spec
- Reports spec operations missing from Insomnia
- Reports method mismatches for known paths
- Reports duplicate request routes
- Handles `:id`, `{id}`, numeric IDs, and UUID-like path segments
- Local Markdown export
- No cloud, no telemetry, no backend, no dependencies

## Install

From Insomnia:

1. Open **Preferences** → **Plugins**
2. Enter `insomnia-plugin-openapi-drift-check`
3. Click **Install Plugin**

Manual macOS install:

```bash
cd "$HOME/Library/Application Support/Insomnia/plugins"
npm install insomnia-plugin-openapi-drift-check
```

## Usage

Run:

```text
OpenAPI Drift Check: Export Report
```

The action is exposed through `workspaceActions`, `requestGroupActions`, and `requestActions`. In Insomnia 13 it may appear in the New Request dropdown.

## Expected spec source

The MVP looks for a JSON OpenAPI/Swagger spec embedded in the Insomnia workspace export, including fields such as:

- `contents`
- `content`
- `spec`
- `schema`
- `text`

It supports JSON specs. YAML parsing is intentionally not included to keep the plugin dependency-free.

## Example report

```markdown
# Insomnia OpenAPI Drift Check Report

| Severity | Type | Location | Message | Preview |
|---|---|---|---|---|
| high | undocumented-request | $.resources[2] | Insomnia request not found in OpenAPI spec | DELETE /users/{id} |
| medium | missing-request | openapi.paths | OpenAPI operation has no matching Insomnia request | GET /health |
```

## Privacy

- Local-only
- No network calls
- No analytics
- No account required
- Exports with `includePrivate: false`

## Development

```bash
git clone https://github.com/oliviajohns5/insomnia-plugin-openapi-drift-check.git
cd insomnia-plugin-openapi-drift-check
npm test
npm run test:packaged
npm pack --dry-run
```

## Verified QA

- `node --check main.js`
- `node --check test.js`
- `node --check real-insomnia-packaged-test.js`
- `node --check qa-packaged.js`
- `npm test`
- `npm run test:packaged`
- `npm pack --dry-run`
- isolated tarball install
- package metadata validation
- credential literal scan

## Requirements

- Insomnia
- JSON OpenAPI/Swagger spec in the workspace export
- Node.js/npm only for development or publishing

## License

MIT
