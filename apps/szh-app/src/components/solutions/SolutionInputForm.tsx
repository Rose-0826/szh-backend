import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { JSONSchema } from '@/types/domain';
import { fieldsFromSchema, type FieldModel } from '@/lib/schema';
import { Callout, Field, Input, Select, Switch, Textarea } from '@/components/ui';

/**
 * Generic form generated from a SolutionVersion's input_schema.
 * Knows nothing about any particular domain — new Solutions get a form for free.
 */
export function SolutionInputForm({ schema, values, errors, onChange, disabled }: {
  schema: JSONSchema; values: Record<string, unknown>; errors: Record<string, string>;
  onChange: (key: string, value: unknown) => void; disabled?: boolean;
}) {
  const fields = fieldsFromSchema(schema);
  const basic = fields.filter((f) => !f.advanced);
  const advanced = fields.filter((f) => f.advanced);
  const [showAdvanced, setShowAdvanced] = useState(() => advanced.some((f) => errors[f.key]));
  const unsupported = fields.filter((f) => f.control === 'unsupported');

  if (fields.length === 0) return <Callout tone="neutral" title="该版本不需要输入参数">可以直接校验并运行。</Callout>;

  return (
    <div className="schema-form">
      {basic.map((f) => <FieldControl key={f.key} field={f} value={values[f.key]} error={errors[f.key]} onChange={onChange} disabled={disabled} />)}
      {advanced.length > 0 && (
        <div className="advanced">
          <button type="button" className="advanced-toggle" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
            <ChevronDown size={14} style={{ transform: showAdvanced ? 'rotate(180deg)' : undefined, transition: 'transform var(--dur) var(--ease)' }} />
            高级参数<span className="faint">（{advanced.length}）</span>
          </button>
          {showAdvanced && <div className="schema-form advanced-body">
            {advanced.map((f) => <FieldControl key={f.key} field={f} value={values[f.key]} error={errors[f.key]} onChange={onChange} disabled={disabled} />)}
          </div>}
        </div>
      )}
      {unsupported.length > 0 && <Callout tone="warning" title="部分参数暂不支持表单编辑">{unsupported.map((f) => f.label).join('、')}</Callout>}
    </div>
  );
}

function FieldControl({ field: f, value, error, onChange, disabled }: { field: FieldModel; value: unknown; error?: string; onChange: (k: string, v: unknown) => void; disabled?: boolean }) {
  const id = `field-${f.key}`;
  const hint = [f.description, f.schema.minimum !== undefined || f.schema.maximum !== undefined ? `范围 ${f.schema.minimum ?? '−∞'} – ${f.schema.maximum ?? '∞'}` : ''].filter(Boolean).join(' · ');
  let control;
  switch (f.control) {
    case 'select':
      control = <Select id={id} invalid={!!error} disabled={disabled} value={value === undefined ? '' : String(value)} placeholder="请选择"
        options={(f.options ?? []).map((o) => ({ value: String(o), label: String(o) }))}
        onChange={(e) => { const raw = e.target.value; const opt = f.options?.find((o) => String(o) === raw); onChange(f.key, raw === '' ? undefined : opt); }} />;
      break;
    case 'textarea':
      control = <Textarea id={id} invalid={!!error} disabled={disabled} mono={/points|json|csv/i.test(f.key)} value={(value as string) ?? ''} onChange={(e) => onChange(f.key, e.target.value)} />;
      break;
    case 'number': case 'integer':
      control = <Input id={id} type="number" inputMode="decimal" invalid={!!error} disabled={disabled} affix={f.unit} step={f.control === 'integer' ? 1 : 'any'}
        value={value === undefined ? '' : String(value)} onChange={(e) => onChange(f.key, e.target.value === '' ? undefined : Number(e.target.value))} />;
      break;
    case 'switch':
      return (
        <div className="field-inline">
          <div className="stack grow"><label htmlFor={id} className="field-label">{f.label}</label>{hint && <span className="field-hint">{hint}</span>}</div>
          <Switch id={id} label={f.label} checked={Boolean(value)} onChange={(v) => onChange(f.key, v)} />
        </div>
      );
    case 'text':
      control = <Input id={id} invalid={!!error} disabled={disabled} affix={f.unit} value={(value as string) ?? ''} onChange={(e) => onChange(f.key, e.target.value)} />;
      break;
    default:
      return null;
  }
  return <Field label={f.label} required={f.required} hint={hint || undefined} error={error} htmlFor={id}>{control}</Field>;
}
