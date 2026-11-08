import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readEnv(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

export function loadModelConfig() {
  const privateConfig = join(homedir(), '.config/szh/model.env');
  const shared = readEnv(process.env.SZH_MODEL_ENV_FILE || (existsSync(privateConfig) ? privateConfig : join(homedir(), '.config/autoresearch/glm.env')));
  const local = readEnv(join(projectRoot, '.env'));
  const values = { ...shared, ...local, ...process.env };
  const provider = values.SZH_MODEL_PROVIDER || (values.AUTORESEARCH_MODEL ? 'zai' : 'deepseek-official');
  const config = {
    provider,
    model: values.SZH_MODEL || values.AUTORESEARCH_MODEL || 'deepseek-flash',
    baseURL: values.SZH_MODEL_BASE_URL || values.AUTORESEARCH_MODEL_BASE_URL || '',
    apiKey: values.SZH_MODEL_API_KEY || values.AUTORESEARCH_MODEL_API_KEY || '',
    reasoningEffort: values.SZH_MODEL_REASONING_EFFORT || (provider === 'deepseek-official' ? 'max' : 'low'),
  };
  if (!config.baseURL || !config.apiKey) throw new Error('model_not_configured');
  return config;
}
