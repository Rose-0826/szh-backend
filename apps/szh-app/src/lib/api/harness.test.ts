import { describe, expect, it } from 'vitest';
import { artifactKind, groupSolutions, parseAjvErrors, toRun } from './harness';

type Record = Parameters<typeof groupSolutions>[0][number];

const record = (id: string, version: string, extra: Partial<Record['manifest']> = {}): Record => ({
  status: 'published', published_at: `2026-11-0${version.split('.')[1]}T00:00:00Z`,
  manifest: {
    id, version, name: `${id} v${version}`, description: 'd', domain: '测试',
    input_schema: { type: 'object' }, output_schema: { type: 'object' }, runtime: { adapter: 'a', entrypoint: 'e' }, ...extra,
  },
});

describe('groupSolutions', () => {
  it('groups versions per solution and orders them by semver, newest first', () => {
    const [a, b] = groupSolutions([record('alpha', '0.2.0'), record('beta', '1.0.0'), record('alpha', '0.10.0'), record('alpha', '0.9.1')]);
    expect(a.id).toBe('alpha');
    expect(a.versions.map((v) => v.version)).toEqual(['0.10.0', '0.9.1', '0.2.0']);
    expect(a.latestVersion).toBe('0.10.0');
    expect(a.name).toBe('alpha v0.10.0'); // identity comes from the latest manifest
    expect(b.versions).toHaveLength(1);
  });

  it('marks data as coming from Harness and fills optional manifest fields', () => {
    const [s] = groupSolutions([record('alpha', '0.1.0', { validation: { scope: '范围' }, tags: ['t'] })]);
    expect(s.origin).toBe('harness');
    expect(s.tags).toEqual(['t']);
    expect(s.versions[0]).toMatchObject({ validationScope: '范围', delivery: {}, assets: [], status: 'published', publishedAt: '2026-11-01T00:00:00Z' });
  });

  it('returns an empty list for an empty registry', () => {
    expect(groupSolutions([])).toEqual([]);
  });
});

describe('parseAjvErrors', () => {
  it('maps AJV errorsText to field messages', () => {
    const text = "data/case_id must be equal to one of the allowed values, data must have required property 'text', data/top_k must be <= 50";
    expect(parseAjvErrors(text)).toEqual({ case_id: 'must be equal to one of the allowed values', text: '必填', top_k: 'must be <= 50' });
  });

  it('ignores root-level errors that have no field', () => {
    expect(parseAjvErrors('data must NOT have additional properties')).toEqual({});
    expect(parseAjvErrors('')).toEqual({});
  });
});

describe('artifactKind', () => {
  it.each([
    ['plot.PNG', 'image'], ['fit.svg', 'image'], ['table.csv', 'table'], ['data.tsv', 'table'], ['report.pdf', 'pdf'],
    ['summary.json', 'json'], ['execution.log', 'text'], ['README.md', 'text'], ['config.yaml', 'text'],
    ['prediction.npz', 'model'], ['weights.safetensors', 'model'], ['bundle.zip', 'archive'], ['blob.bin', 'binary'], ['noext', 'binary'],
  ])('%s → %s', (name, kind) => {
    expect(artifactKind(name)).toBe(kind);
  });
});

describe('toRun', () => {
  const base = { id: 'r1', solution_id: 'alpha', version: '0.1.0', input: { a: 1 }, created_at: '2026-11-08T01:00:00Z' };

  it('derives a factual timeline from recorded timestamps only', () => {
    expect(toRun({ ...base, status: 'queued' }).events.map((e) => e.status)).toEqual(['queued']);
    const done = toRun({ ...base, status: 'succeeded', started_at: '2026-11-08T01:00:01Z', finished_at: '2026-11-08T01:00:05Z', artifacts: [{ id: 'a1', run_id: 'r1', name: 'out.csv', size: 10 }] });
    expect(done.events.map((e) => e.status)).toEqual(['queued', 'running', 'succeeded']);
    expect(done.artifacts[0]).toMatchObject({ runId: 'r1', kind: 'table' });
    expect(done.solutionName).toBe('alpha'); // falls back to the id without a manifest
  });

  it('carries the Harness error into the failure event', () => {
    const failed = toRun({ ...base, status: 'failed', finished_at: '2026-11-08T01:00:05Z', error: '推理环境尚未配置。' });
    expect(failed.events.at(-1)).toMatchObject({ kind: 'error', message: '推理环境尚未配置。' });
  });
});
