'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const plugin = require('./main');
const t = plugin.__test;
const spec = { openapi: '3.0.0', paths: { '/users/{id}': { get: { operationId: 'getUser' } }, '/health': { get: {} }, '/orders/{id}': { post: {} } } };
const workspace = JSON.stringify({ resources: [
  { _type: 'apiSpec', contents: JSON.stringify(spec) },
  { _type: 'request', name: 'Get user', method: 'GET', url: 'https://api.example.com/users/42' },
  { _type: 'request', name: 'Get user copy', method: 'GET', url: 'https://api.example.com/users/43' },
  { _type: 'request', name: 'Delete user', method: 'DELETE', url: 'https://api.example.com/users/42' },
  { _type: 'request', name: 'Create order wrong', method: 'GET', url: 'https://api.example.com/orders/abc123abc123' }
] });
function ctx(out) { const alerts=[]; return { alerts, data:{export:{insomnia:async()=>workspace}}, app:{showSaveDialog:async()=>out,getPath:async k=>k==='documents'?os.tmpdir():'',alert:async(t,m)=>alerts.push({t,m})} }; }
async function main(){
  assert(Array.isArray(plugin.workspaceActions));
  assert(Array.isArray(plugin.requestGroupActions));
  assert(Array.isArray(plugin.requestActions));
  assert.strictEqual(t.normalizePath('/users/42'), '/users/{id}');
  assert.strictEqual(t.normalizePath('/users/:id/'), '/users/{id}');
  assert.strictEqual(t.routeKey('get','/users/42'), 'GET /users/{id}');
  assert.strictEqual(t.normalizePath('{{ _.baseUrl }}/v1/users/42'), '/v1/users/{id}');
  assert.strictEqual(t.normalizePath('{{ base_url }}/v1/users/42'), '/v1/users/{id}');
  assert.strictEqual(t.extractUrlPath('https://{env}.example.com/v2/users'), '/v2/users');
  const parsed=t.parseRequestRoute({method:'GET',url:'https://x.test/users/123'});
  assert.strictEqual(parsed.key, 'GET /users/{id}');
  assert.strictEqual(t.parseRequestRoute({method:'GET',url:'{{ _.baseUrl }}/v1/users/123'}).key, 'GET /v1/users/{id}');
  assert.strictEqual(t.parseRequestRoute({method:'GET',url:'{{ base_url }}/v1/health'}).key, 'GET /v1/health');
  const exp=t.parseExport(workspace);
  assert.strictEqual(t.collectRequests(exp).length, 4);
  assert.strictEqual(t.collectSpecRoutes(spec).length, 3);
  const swaggerRoutes = t.collectSpecRoutes({ swagger: '2.0', basePath: '/v1', paths: { '/legacy/{id}': { get: { operationId: 'legacyGet' } } } });
  assert.strictEqual(swaggerRoutes[0].key, 'GET /v1/legacy/{id}');
  const serverRoutes = t.collectSpecRoutes({ openapi: '3.0.0', servers: [{ url: 'https://api.example.com/v2' }], paths: { '/widgets/{id}': { get: { operationId: 'getWidget' } } } });
  assert.strictEqual(serverRoutes[0].key, 'GET /v2/widgets/{id}');
  const templatedServerRoutes = t.collectSpecRoutes({ openapi: '3.0.0', servers: [{ url: '{{ _.baseUrl }}/v3' }], paths: { '/widgets/{id}': { get: {} } } });
  assert.strictEqual(templatedServerRoutes[0].key, 'GET /v3/widgets/{id}');
  const serverWorkspace = JSON.stringify({resources:[{contents:JSON.stringify({openapi:'3.0.0',servers:[{url:'https://api.example.com/v1'}],paths:{'/users/{id}':{get:{}}}})},{_type:'request',method:'GET',url:'{{ _.baseUrl }}/v1/users/42'}]});
  assert.deepStrictEqual(t.driftCheck(serverWorkspace), []);
  assert.strictEqual(t.coverageStats(serverWorkspace).workspaceCoveredPercent, 100);
  assert(t.pickSpec(exp).spec.openapi);
  const yaml = 'openapi: 3.0.0\npaths:\n  /yaml/{id}:\n    get:\n      responses: {}\n';
  assert.strictEqual(t.collectSpecRoutes(t.tryYamlOpenApi(yaml))[0].key, 'GET /yaml/{id}');
  const findings=t.driftCheck(workspace);
  const types=new Set(findings.map(f=>f.type));
  for (const expected of ['undocumented-request','missing-request','method-mismatch','duplicate-request-route']) assert(types.has(expected), expected);
  const coverage=t.coverageStats(workspace);
  assert.strictEqual(coverage.workspaceCoveredPercent, 50, 'workspace coverage percent');
  assert.strictEqual(coverage.specCoveredPercent, 33, 'spec coverage percent');
  const report=t.makeMarkdown(findings, coverage);
  assert(report.includes('# Insomnia OpenAPI Drift Check Report'));
  assert(report.includes('## Coverage'));
  assert(report.includes('Workspace routes covered by spec: 50% (2/4)'));
  assert(report.includes('Spec routes represented in workspace: 33% (1/3)'));
  assert(report.includes('| Severity | Type | Location | Message | Preview |'));
  const missing=t.driftCheck(JSON.stringify({resources:[{_type:'request',method:'GET',url:'https://x.test/a'}]}));
  assert(missing.some(f=>f.type==='missing-openapi-spec'));
  const clean=t.driftCheck(JSON.stringify({resources:[{contents:JSON.stringify({openapi:'3.0.0',paths:{'/a':{get:{}}}})},{_type:'request',method:'GET',url:'https://x.test/a'}]}));
  assert.strictEqual(t.summarize(clean).high,0);
  assert.strictEqual(t.summarize(clean).medium,0);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'openapi-drift-'));
  try{ for(const action of [plugin.workspaceActions[0],plugin.requestGroupActions[0],plugin.requestActions[0]]){ const out=path.join(tmp,Math.random().toString(36).slice(2)+'.md'); const c=ctx(out); await action.action(c); assert(fs.existsSync(out)); assert(fs.readFileSync(out,'utf8').includes('OpenAPI Drift Check Report')); assert.strictEqual(c.alerts.length,1); }} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
  console.log('PASS: all tests');
}
main().catch(e=>{console.error(e.stack||e);process.exit(1);});
