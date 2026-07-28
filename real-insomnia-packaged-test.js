'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const plugin = require('insomnia-plugin-openapi-drift-check');
const spec={openapi:'3.0.0',paths:{'/users/{id}':{get:{}},'/health':{get:{}}}};
const workspace=JSON.stringify({resources:[{contents:JSON.stringify(spec)},{_type:'request',method:'GET',url:'https://api.example.com/users/1'},{_type:'request',method:'DELETE',url:'https://api.example.com/users/1'}]});
function ctx(out){const alerts=[];return{alerts,data:{export:{insomnia:async()=>workspace}},app:{showSaveDialog:async()=>out,getPath:async k=>k==='documents'?os.tmpdir():'',alert:async(t,m)=>alerts.push({t,m})}};}
async function main(){assert(Array.isArray(plugin.workspaceActions));assert(Array.isArray(plugin.requestGroupActions));assert(Array.isArray(plugin.requestActions));assert(plugin.__test.driftCheck);const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'openapi-drift-packaged-'));try{for(const action of [plugin.workspaceActions[0],plugin.requestGroupActions[0],plugin.requestActions[0]]){const out=path.join(tmp,Math.random().toString(36).slice(2)+'.md');await action.action(ctx(out));const report=fs.readFileSync(out,'utf8');assert(report.includes('OpenAPI Drift Check Report'));assert(report.includes('undocumented-request'));assert(report.includes('missing-request'));}}finally{fs.rmSync(tmp,{recursive:true,force:true});}console.log('PASS: packaged plugin integration harness');}
main().catch(e=>{console.error(e.stack||e);process.exit(1);});
