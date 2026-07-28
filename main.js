'use strict';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']);

function safeString(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function parseExport(raw) {
  try { return JSON.parse(safeString(raw)); } catch { return { _raw: safeString(raw) }; }
}

function walk(value, visit, path = '$') {
  if (value == null) return;
  visit(value, path);
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, visit, `${path}[${i}]`));
  else if (typeof value === 'object') Object.keys(value).forEach(k => walk(value[k], visit, `${path}.${k}`));
}

function isRequest(obj) {
  return obj && typeof obj === 'object' && typeof obj.url === 'string' && (typeof obj.method === 'string' || String(obj._type || '').toLowerCase() === 'request');
}

function normalizePath(pathname) {
  let p = safeString(pathname).split('?')[0].replace(/\/+/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\{([^}]+)\}/g, '{$1}');
  p = p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  p = p.replace(/\/\d+(?=\/|$)/g, '/{id}');
  p = p.replace(/\/[0-9a-fA-F-]{12,}(?=\/|$)/g, '/{id}');
  return p === '/' ? '/' : p.replace(/\/$/, '');
}

function routeKey(method, pathname) {
  return `${safeString(method).toUpperCase()} ${normalizePath(pathname)}`;
}

function parseRequestRoute(obj) {
  const method = safeString(obj.method || 'GET').toUpperCase();
  try {
    const u = new URL(safeString(obj.url));
    return { method, path: normalizePath(u.pathname), key: routeKey(method, u.pathname), host: u.hostname, name: safeString(obj.name || '') };
  } catch {
    const raw = safeString(obj.url || '');
    const m = raw.match(/^(?:https?:\/\/[^/]+)?([^?#]*)/i);
    const path = normalizePath(m ? m[1] : raw);
    return { method, path, key: routeKey(method, path), host: '', name: safeString(obj.name || '') };
  }
}

function collectRequests(parsed) {
  const routes = [];
  walk(parsed, (obj, path) => { if (isRequest(obj)) routes.push(Object.assign({ location: path }, parseRequestRoute(obj))); });
  return routes;
}

function tryJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function extractSpecCandidates(parsed) {
  const candidates = [];
  walk(parsed, (obj, path) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    for (const key of ['contents', 'content', 'spec', 'schema', 'text']) {
      if (typeof obj[key] === 'string') {
        const parsedSpec = tryJson(obj[key]);
        if (parsedSpec && (parsedSpec.openapi || parsedSpec.swagger || parsedSpec.paths)) candidates.push({ spec: parsedSpec, location: `${path}.${key}` });
      }
    }
    if ((obj.openapi || obj.swagger || obj.paths) && typeof obj.paths === 'object') candidates.push({ spec: obj, location: path });
  });
  return candidates;
}

function pickSpec(parsed) {
  const candidates = extractSpecCandidates(parsed);
  if (!candidates.length) return null;
  candidates.sort((a, b) => Object.keys((b.spec && b.spec.paths) || {}).length - Object.keys((a.spec && a.spec.paths) || {}).length);
  return candidates[0];
}

function collectSpecRoutes(spec) {
  const routes = [];
  const paths = spec && spec.paths && typeof spec.paths === 'object' ? spec.paths : {};
  for (const [pathName, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const [method, operation] of Object.entries(item)) {
      const upper = method.toUpperCase();
      if (!METHODS.has(upper)) continue;
      routes.push({ method: upper, path: normalizePath(pathName), key: routeKey(upper, pathName), operationId: safeString(operation && operation.operationId || '') });
    }
  }
  return routes;
}

function add(findings, severity, type, location, message, preview) {
  findings.push({ severity, type, location, message, preview: safeString(preview).slice(0, 220) });
}

function driftCheck(rawExport) {
  const parsed = parseExport(rawExport);
  const requests = collectRequests(parsed);
  const specCandidate = pickSpec(parsed);
  const findings = [];
  if (!specCandidate) {
    add(findings, 'medium', 'missing-openapi-spec', 'workspace', 'No JSON OpenAPI/Swagger spec found in workspace export', 'Add an OpenAPI spec/design document to compare against.');
    return findings;
  }
  const specRoutes = collectSpecRoutes(specCandidate.spec);
  const reqMap = new Map();
  for (const req of requests) if (!reqMap.has(req.key)) reqMap.set(req.key, []); 
  for (const req of requests) reqMap.get(req.key).push(req);
  const specMap = new Map(specRoutes.map(r => [r.key, r]));

  if (!specRoutes.length) add(findings, 'medium', 'empty-openapi-spec', specCandidate.location, 'OpenAPI spec has no method/path operations', 'paths is empty or contains no HTTP methods');
  if (!requests.length) add(findings, 'medium', 'no-requests', 'workspace.requests', 'No Insomnia requests found to compare', '0 requests');

  for (const req of requests) {
    if (!specMap.has(req.key)) add(findings, 'high', 'undocumented-request', req.location, 'Insomnia request not found in OpenAPI spec', req.key);
  }
  for (const route of specRoutes) {
    if (!reqMap.has(route.key)) add(findings, 'medium', 'missing-request', 'openapi.paths', 'OpenAPI operation has no matching Insomnia request', route.key + (route.operationId ? ` (${route.operationId})` : ''));
  }
  const pathOnlySpec = new Map();
  for (const r of specRoutes) pathOnlySpec.set(r.path, (pathOnlySpec.get(r.path) || []).concat(r.method));
  for (const req of requests) {
    if (!specMap.has(req.key) && pathOnlySpec.has(req.path)) add(findings, 'medium', 'method-mismatch', req.location, 'Path exists in spec with a different method', `${req.key}; spec has ${pathOnlySpec.get(req.path).join(', ')}`);
  }
  const seen = new Map();
  for (const req of requests) seen.set(req.key, (seen.get(req.key) || 0) + 1);
  for (const [key, count] of seen) if (count > 1) add(findings, 'low', 'duplicate-request-route', 'workspace.requests', 'Duplicate Insomnia request route', `${key} (${count})`);

  return findings.slice(0, 500);
}

function summarize(findings) {
  return findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, { high: 0, medium: 0, low: 0 });
}

function makeMarkdown(findings) {
  const counts = summarize(findings);
  const rows = findings.map(f => `| ${f.severity} | ${f.type} | ${f.location} | ${f.message} | ${String(f.preview).replace(/\|/g, '\\|')} |`).join('\n');
  return `# Insomnia OpenAPI Drift Check Report\n\nGenerated: ${new Date().toISOString()}\n\nLocal-only report. Compares Insomnia request routes to a JSON OpenAPI/Swagger spec found in the workspace export.\n\n## Summary\n\n- High: ${counts.high}\n- Medium: ${counts.medium}\n- Low: ${counts.low}\n\n## Findings\n\n| Severity | Type | Location | Message | Preview |\n|---|---|---|---|---|\n${rows || '| low | none | workspace | No OpenAPI route drift detected. |  |'}\n`;
}

async function getWritableExportPath(context, fileName) {
  const path = require('path');
  const candidates = [];
  if (context.app && typeof context.app.getPath === 'function') {
    for (const key of ['documents', 'desktop', 'downloads', 'userData', 'home']) {
      try { const v = await context.app.getPath(key); if (v) candidates.push(v); } catch {}
    }
  }
  candidates.push(process.env.HOME || process.env.USERPROFILE || process.cwd());
  return path.join(candidates.find(Boolean) || '.', fileName);
}

const action = {
  label: 'OpenAPI Drift Check: Export Report',
  icon: 'fa-route',
  action: async (context) => {
    const raw = await context.data.export.insomnia({ includePrivate: false, format: 'json' });
    const report = makeMarkdown(driftCheck(raw));
    const fs = require('fs');
    let output = null;
    if (context.app && typeof context.app.showSaveDialog === 'function') output = await context.app.showSaveDialog({ defaultPath: 'insomnia-openapi-drift.md' });
    if (!output) output = await getWritableExportPath(context, 'insomnia-openapi-drift.md');
    fs.writeFileSync(output, report, 'utf8');
    if (context.app && typeof context.app.alert === 'function') await context.app.alert('OpenAPI Drift Check report exported', output);
  }
};

module.exports.workspaceActions = [action];
module.exports.requestGroupActions = [action];
module.exports.requestActions = [action];
module.exports.__test = { collectRequests, collectSpecRoutes, driftCheck, extractSpecCandidates, getWritableExportPath, makeMarkdown, normalizePath, parseExport, parseRequestRoute, pickSpec, routeKey, summarize };
