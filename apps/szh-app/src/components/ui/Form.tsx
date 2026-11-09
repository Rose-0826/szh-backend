import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { AlertCircle, Search } from 'lucide-react';

export function Field({ label, hint, error, required, children, htmlFor }: {
  label: ReactNode; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode; htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden>*</span>}</label>
      {children}
      {error ? <span className="field-error" role="alert"><AlertCircle size={12} />{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; affix?: string }>(
  function Input({ className, invalid, affix, ...rest }, ref) {
    const input = <input ref={ref} className={clsx('input', className)} aria-invalid={invalid || undefined} {...rest} />;
    return affix ? <div className="input-affix">{input}<span className="affix">{affix}</span></div> : input;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; mono?: boolean }>(
  function Textarea({ className, invalid, mono, ...rest }, ref) {
    return <textarea ref={ref} className={clsx('textarea', mono && 'mono', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export function Select({ className, invalid, options, placeholder, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean; options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <select className={clsx('select', className)} aria-invalid={invalid || undefined} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function SearchInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const id = useId();
  return (
    <div className="search-input">
      <label htmlFor={id} className="sr-only">{placeholder}</label>
      <Search />
      <input id={id} className="input" value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onChange(''); }} />
    </div>
  );
}
