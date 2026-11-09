import type { JSONSchema } from '@/types/domain';

/** Minimal JSON-Schema subset used to generate forms and give immediate field feedback. Harness remains the authority. */
export type FieldModel = {
  key: string;
  label: string;
  description?: string;
  required: boolean;
  advanced: boolean;
  unit?: string;
  control: 'text' | 'textarea' | 'number' | 'integer' | 'select' | 'switch' | 'unsupported';
  options?: (string | number)[];
  schema: JSONSchema;
};

export function fieldsFromSchema(schema: JSONSchema): FieldModel[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([key, s]) => {
    const type = Array.isArray(s.type) ? s.type[0] : s.type;
    let control: FieldModel['control'] = 'unsupported';
    if (s.enum) control = 'select';
    else if (type === 'string') control = s['x-widget'] === 'textarea' || (s.maxLength ?? 0) > 200 ? 'textarea' : 'text';
    else if (type === 'number') control = 'number';
    else if (type === 'integer') control = 'integer';
    else if (type === 'boolean') control = 'switch';
    return {
      key, label: s.title ?? key, description: s.description, required: required.has(key),
      advanced: Boolean(s['x-advanced']), unit: s['x-unit'], control, options: s.enum, schema: s,
    };
  });
}

export function defaultsFromSchema(schema: JSONSchema): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, s] of Object.entries(schema.properties ?? {})) if (s.default !== undefined) values[key] = s.default;
  return values;
}

export function validateAgainstSchema(schema: JSONSchema, input: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fieldsFromSchema(schema)) {
    const value = input[field.key];
    const s = field.schema;
    if (value === undefined || value === '') { if (field.required) errors[field.key] = '必填'; continue; }
    if (s.enum && !s.enum.includes(value as string)) errors[field.key] = '请选择列表中的选项';
    else if (field.control === 'number' || field.control === 'integer') {
      if (typeof value !== 'number' || Number.isNaN(value)) errors[field.key] = '请输入数字';
      else if (field.control === 'integer' && !Number.isInteger(value)) errors[field.key] = '请输入整数';
      else if (s.minimum !== undefined && value < s.minimum) errors[field.key] = `不小于 ${s.minimum}`;
      else if (s.maximum !== undefined && value > s.maximum) errors[field.key] = `不大于 ${s.maximum}`;
    } else if (typeof value === 'string') {
      if (s.minLength !== undefined && value.trim().length < s.minLength) errors[field.key] = `至少 ${s.minLength} 个字符`;
      else if (s.maxLength !== undefined && value.length > s.maxLength) errors[field.key] = `最多 ${s.maxLength} 个字符`;
    }
  }
  if (schema.additionalProperties === false) {
    const known = new Set(Object.keys(schema.properties ?? {}));
    for (const key of Object.keys(input)) if (!known.has(key)) errors[key] = '不支持的参数';
  }
  return errors;
}
