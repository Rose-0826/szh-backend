import Ajv from 'ajv';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export class ProtocolError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const schema = {
  type: 'object', required: ['schema_version', 'id', 'version', 'name', 'description', 'domain', 'input_schema', 'output_schema', 'runtime', 'assets', 'validation', 'delivery'],
  properties: {
    schema_version: { const: '0.1' },
    id: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
    version: { type: 'string', pattern: '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$' },
    name: { type: 'string', minLength: 1 }, description: { type: 'string', minLength: 1 }, domain: { type: 'string', minLength: 1 },
    input_schema: { type: 'object' }, output_schema: { type: 'object' },
    runtime: { type: 'object', required: ['adapter', 'entrypoint'], properties: { adapter: { type: 'string', minLength: 1 }, entrypoint: { type: 'string', minLength: 1 } } },
    assets: { type: 'array', items: { type: 'object' } }, validation: { type: 'object' }, delivery: { type: 'object' }
  }
};
const check = ajv.compile(schema);
export function validateManifest(manifest) {
  if (!check(manifest)) throw new ProtocolError('invalid_manifest', ajv.errorsText(check.errors));
  for (const key of ['input_schema', 'output_schema']) {
    if (manifest[key].type !== 'object') throw new ProtocolError('invalid_schema', `${key}: 根类型必须为 object`);
    try { new Ajv({ allErrors: true, strict: true, validateFormats: false }).compile(manifest[key]); }
    catch (error) { throw new ProtocolError('invalid_schema', `${key}: ${error.message}`); }
  }
  return structuredClone(manifest);
}
export function validateInput(manifest, input) {
  const validate = ajv.compile(manifest.input_schema);
  if (!validate(input)) throw new ProtocolError('invalid_input', ajv.errorsText(validate.errors));
  return structuredClone(input);
}
export class SolutionRegistry {
  constructor(directory) { this.directory = directory; }
  async publish(manifest) {
    const snapshot = validateManifest(manifest);
    await mkdir(this.directory, { recursive: true });
    const record = { manifest: snapshot, status: 'published', published_at: new Date().toISOString() };
    try { await writeFile(join(this.directory, `${snapshot.id}@${snapshot.version}.json`), JSON.stringify(record, null, 2), { flag: 'wx' }); }
    catch (error) { if (error.code === 'EEXIST') throw new ProtocolError('version_conflict', '该版本已存在，请使用新版本号。'); throw error; }
    return record;
  }
  async list() {
    await mkdir(this.directory, { recursive: true });
    const files = (await readdir(this.directory)).filter(name => name.endsWith('.json')).sort();
    return Promise.all(files.map(async name => JSON.parse(await readFile(join(this.directory, name), 'utf8'))));
  }
  async get(id, version) {
    const record = (await this.list()).find(item => item.manifest.id === id && item.manifest.version === version);
    if (!record) throw new ProtocolError('version_not_found', '未找到指定方案版本。');
    return record;
  }
}
