import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

const cls = (variant: Variant, size: Size, className?: string) =>
  clsx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, className);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, children, className, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} className={cls(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="spinner" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'secondary', size = 'md', icon, children, className, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return <Link className={cls(variant, size, className)} {...rest}>{icon}{children}</Link>;
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  pressed?: boolean;
}

/** Icon-only button. `label` is required for accessibility and doubles as the tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', pressed, className, children, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} aria-label={label} title={label} aria-pressed={pressed}
      className={clsx('icon-btn', size === 'sm' && 'icon-btn-sm', className)} {...rest}>
      {children}
    </button>
  );
});
