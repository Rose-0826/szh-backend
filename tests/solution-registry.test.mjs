import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SolutionRegistry, validateManifest, validateInput } from '../apps/server/solution-registry.mjs';
const manifest = () => ({ schema_version: '0.1', id: 'test-solution', version: '0.1.0', name: '契约测试方案', description: '仅用于测试', domain: 'test', input_schema: { type: 'object', required: ['count'], properties: { count: { type: 'integer', minimum: 1 } }, additionalProperties: false }, output_schema: { type: 'object' }, runtime: { adapter: 'test', entrypoint: 'test-only' }, assets: [], validation: {}, delivery: {} });
test('Manifest 拒绝缺失入口和无效 Schema', () => {
  const missing = manifest(); delete missing.runtime.entrypoint;
  assert.throws(() => validateManifest(missing), { code: 'invalid_manifest' });
  const broken = manifest(); broken.input_schema.properties.count.type = 'not-a-type';
  assert.throws(() => validateManifest(broken), { code: 'invalid_schema' });
});
test('输入遵循类型、必填项和数值范围', () => {
  assert.deepEqual(validateInput(manifest(), { count: 2 }), { count: 2 });
  for (const input of [{}, { count: 0 }, { count: '2' }]) assert.throws(() => validateInput(manifest(), input), { code: 'invalid_input' });
});
test('发布版本持久化、禁止覆盖且与调用方对象独立', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'szh-registry-'));
  const registry = new SolutionRegistry(directory);
  const source = manifest(); await registry.publish(source); source.name = '修改';
  await assert.rejects(registry.publish(source), { code: 'version_conflict' });
  const reopened = new SolutionRegistry(directory);
  assert.equal((await reopened.get('test-solution', '0.1.0')).manifest.name, '契约测试方案');
  source.version = '0.2.0'; await reopened.publish(source);
  assert.equal((await reopened.list()).length, 2);
});

test('注册接口可查询固定版本、校验输入，公共导入不能绕过维护者入口', async (t) => {
  const { createTaskServer } = await import('../apps/server/main.mjs');
  const { TaskService } = await import('../apps/server/tasks.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'szh-registry-api-'));
  const registry = new SolutionRegistry(join(directory, 'versions'));
  await registry.publish(manifest());
  const service = await TaskService.open({ directory });
  const app = await createTaskServer({ service, registry });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}/api/v1/solutions`;
  assert.equal((await (await fetch(base)).json()).data.length, 1);
  const version = base + '/test-solution/versions/0.1.0';
  assert.equal((await (await fetch(version)).json()).data.manifest.version, '0.1.0');
  assert.equal((await fetch(base + '/test-solution/versions/9.0.0')).status, 404);
  const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await fetch(version + '/validate-input', post({ count: 2 }))).status, 200);
  assert.equal((await fetch(version + '/validate-input', post({ count: -1 }))).status, 400);
  assert.equal((await fetch(base + '/import', post(manifest()))).status, 403);
});
