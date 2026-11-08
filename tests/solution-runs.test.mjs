import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunService } from '../apps/server/solution-runs.mjs';
const registry = { async get() { return { manifest: { input_schema: { type: 'object' }, runtime: { adapter: 'test' } } }; } };
async function wait(service, id) { for (let n=0; n<100; n++) { const run=service.get(id); if (['succeeded','failed','cancelled'].includes(run.status)) return run; await new Promise(resolve=>setTimeout(resolve,10)); } throw new Error('运行超时'); }
test('运行生成新成果、固定版本、重复提交幂等及重启可读', async () => {
 const directory=await mkdtemp(join(tmpdir(),'szh-run-')); let calls=0;
 const service=await RunService.open(directory,registry,async(run,output)=>{ calls++; await writeFile(join(output,'result.json'),JSON.stringify(run.input)); });
 const request={solution_id:'example',version:'0.1.0',input:{value:42},request_id:'one'};
 const [first,second]=await Promise.all([service.create(request),service.create(request)]);
 assert.equal(first.id,second.id); const result=await wait(service,first.id); assert.equal(calls,1); assert.equal(result.status,'succeeded'); assert.equal(result.version,'0.1.0');
 assert.equal(JSON.parse((await service.artifact(first.id,result.artifacts[0].id)).bytes).value,42);
 const reopened=await RunService.open(directory,registry); assert.equal(reopened.get(first.id).status,'succeeded');
 await assert.rejects(service.create({...request,input:{value:43}}),{code:'request_conflict'});
});
test('执行失败不生成成功结果，取消终止执行',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'szh-run-failure-'));
 const failed=await RunService.open(directory,registry,async()=>{throw new Error('执行错误');});
 const first=await failed.create({solution_id:'example',version:'0.1.0',input:{},request_id:'fail'});
 assert.equal((await wait(failed,first.id)).status,'failed');
 const service=await RunService.open(directory,registry,async(run,output,signal)=>{await new Promise((resolve,reject)=>{if(signal.aborted)return reject(new Error('cancelled'));signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});});});
 const second=await service.create({solution_id:'example',version:'0.1.0',input:{},request_id:'cancel'}); await service.cancel(second.id);
 assert.equal((await wait(service,second.id)).status,'cancelled');
});
