import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

/**
 * Label rendering requires the caller to pass `id` so label/input stay
 * associated without client hooks (this component must render inside RSC).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, wrapperClassName, id, ...props },
  ref,
) {
  const inputId = id;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cn('flex w-full flex-col gap-1.5', wrapperClassName)}>
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-fg-secondary">
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-11 min-h-11 rounded-[12px] border border-border bg-input px-3 text-sm text-fg',
          'placeholder:text-fg-muted focus-visible:border-primary focus-visible:outline-none',
          error && 'border-error',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
