import { describe, expect, it } from 'vitest';
import type { JSONSchema } from '@/types/domain';
import { defaultsFromSchema, fieldsFromSchema, validateAgainstSchema } from './schema';

const schema: JSONSchema = {
  type: 'object', required: ['text', 'model'], additionalProperties: false,
  properties: {
    text: { type: 'string', title: '文本', minLength: 5, maxLength: 20, 'x-widget': 'textarea' },
    name: { type: 'string', maxLength: 50 },
    notes: { type: 'string', maxLength: 500 },
    model: { type: 'string', enum: ['linear', 'quadratic'], default: 'linear' },
    top_k: { type: 'integer', minimum: 1, maximum: 50, default: 10, 'x-advanced': true },
    delay: { type: 'number', minimum: 0.2, 'x-unit': 's' },
    lowercase: { type: 'boolean', default: true },
    payload: { type: 'object' },
  },
};

describe('fieldsFromSchema', () => {
  const fields = Object.fromEntries(fieldsFromSchema(schema).map((f) => [f.key, f]));

  it('maps JSON Schema types to controls', () => {
    expect(fields.text.control).toBe('textarea');
    expect(fields.name.control).toBe('text');
    expect(fields.notes.control).toBe('textarea'); // long strings get a textarea
    expect(fields.model.control).toBe('select');
    expect(fields.top_k.control).toBe('integer');
    expect(fields.delay.control).toBe('number');
    expect(fields.lowercase.control).toBe('switch');
    expect(fields.payload.control).toBe('unsupported');
  });

  it('reads labels, required, advanced and unit hints', () => {
    expect(fields.text.label).toBe('文本');
    expect(fields.name.label).toBe('name');
    expect(fields.text.required).toBe(true);
    expect(fields.name.required).toBe(false);
    expect(fields.top_k.advanced).toBe(true);
    expect(fields.text.advanced).toBe(false);
    expect(fields.delay.unit).toBe('s');
    expect(fields.model.options).toEqual(['linear', 'quadratic']);
  });

  it('handles union types and empty schemas', () => {
    expect(fieldsFromSchema({ type: 'object', properties: { x: { type: ['number', 'null'] } } })[0].control).toBe('number');
    expect(fieldsFromSchema({ type: 'object' })).toEqual([]);
  });
});

describe('defaultsFromSchema', () => {
  it('collects declared defaults only', () => {
    expect(defaultsFromSchema(schema)).toEqual({ model: 'linear', top_k: 10, lowercase: true });
  });
});

describe('validateAgainstSchema', () => {
  const ok = { text: 'hello world', model: 'linear' };

  it('accepts valid input', () => {
    expect(validateAgainstSchema(schema, ok)).toEqual({});
  });

  it('flags missing required fields, including empty strings', () => {
    expect(validateAgainstSchema(schema, {})).toEqual({ text: '必填', model: '必填' });
    expect(validateAgainstSchema(schema, { ...ok, text: '' })).toEqual({ text: '必填' });
  });

  it('checks enum membership', () => {
    expect(validateAgainstSchema(schema, { ...ok, model: 'cubic' })).toEqual({ model: '请选择列表中的选项' });
  });

  it('checks numeric type, integer-ness and bounds', () => {
    expect(validateAgainstSchema(schema, { ...ok, top_k: 'x' })).toEqual({ top_k: '请输入数字' });
    expect(validateAgainstSchema(schema, { ...ok, top_k: Number.NaN })).toEqual({ top_k: '请输入数字' });
    expect(validateAgainstSchema(schema, { ...ok, top_k: 2.5 })).toEqual({ top_k: '请输入整数' });
    expect(validateAgainstSchema(schema, { ...ok, top_k: 0 })).toEqual({ top_k: '不小于 1' });
    expect(validateAgainstSchema(schema, { ...ok, top_k: 51 })).toEqual({ top_k: '不大于 50' });
    expect(validateAgainstSchema(schema, { ...ok, delay: 0.1 })).toEqual({ delay: '不小于 0.2' });
  });

  it('checks string length (minLength ignores surrounding whitespace)', () => {
    expect(validateAgainstSchema(schema, { ...ok, text: '  ab  ' })).toEqual({ text: '至少 5 个字符' });
    expect(validateAgainstSchema(schema, { ...ok, text: 'x'.repeat(21) })).toEqual({ text: '最多 20 个字符' });
  });

  it('rejects unknown keys when additionalProperties is false', () => {
    expect(validateAgainstSchema(schema, { ...ok, extra: 1 })).toEqual({ extra: '不支持的参数' });
    expect(validateAgainstSchema({ ...schema, additionalProperties: true }, { ...ok, extra: 1 })).toEqual({});
  });
});
