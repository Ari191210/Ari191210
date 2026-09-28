import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

export function Field({
  label,
  hint,
  error,
  ...props
}: { label: string; hint?: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input id={id} className={`input ${error ? 'ring-2 ring-red-500' : ''}`} aria-invalid={!!error} {...props} />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <textarea id={id} className="input min-h-32 resize-y py-3 leading-relaxed" {...props} />
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; activeClass: string }[];
  onChange: (v: T | null) => void;
}) {
  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800" role="radiogroup">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              // Tapping the active option clears it (priority is optional).
              onClick={() => onChange(active ? null : o.value)}
              className={`min-h-11 rounded-lg text-sm font-semibold transition-colors ${
                active ? o.activeClass : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ChipSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? '' : o)}
              className={`chip ${active ? 'chip-active' : ''}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between rounded-xl bg-white px-4 text-left font-medium shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
    >
      <span>{label}</span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5.5' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}

/** Hidden file input driven by a visible button (keeps the button a real, accessible control). */
export function FileButton({
  children,
  className,
  accept = 'image/*',
  capture,
  multiple,
  disabled,
  onFiles,
}: {
  children: ReactNode;
  className?: string;
  accept?: string;
  capture?: 'environment' | 'user';
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <label className={`${className ?? ''} ${disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
      <input
        type="file"
        className="sr-only"
        accept={accept}
        capture={capture}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ''; // allow choosing the same file again
          if (files.length) onFiles(files);
        }}
      />
      {children}
    </label>
  );
}
