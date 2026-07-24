import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ChevronDown, LoaderCircle, Search, X } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/utils';

const buttonStyles = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-55',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white hover:bg-brand-strong',
        secondary: 'border border-border bg-surface text-text hover:bg-muted',
        ghost: 'text-text-secondary hover:bg-muted hover:text-text',
        danger: 'bg-error text-white hover:brightness-90',
      },
      size: { default: '', icon: 'size-11 px-0' },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);
export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  loading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3.5 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:bg-muted',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-24 w-full rounded-[var(--radius-md)] border border-border bg-surface p-3.5 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute start-3 top-3.5 size-4 text-text-muted"
        aria-hidden
      />
      <Input className="ps-10" type="search" {...props} />
    </div>
  );
}

export function FormField({
  id,
  label,
  description,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {required && (
          <span className="ms-1 text-error" aria-hidden>
            *
          </span>
        )}{' '}
        {required && <span className="sr-only">required</span>}
      </label>
      {children}
      {description && (
        <p id={`${id}-description`} className="text-xs text-text-secondary">
          {description}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        'rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-card',
        className,
      )}
    >
      {children}
    </section>
  );
}
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
  children: ReactNode;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      <span aria-hidden>●</span>
      {children}
    </span>
  );
}
export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'success' | 'warning' | 'error' | 'info';
  title: string;
  children?: ReactNode;
}) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`alert alert-${tone}`}>
      <strong>{title}</strong>
      {children && <div className="mt-1 text-sm">{children}</div>}
    </div>
  );
}
export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-text-secondary" role="status">
      <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
      {label}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
    />
  );
}

export function Checkbox({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <CheckboxPrimitive.Root
        id={id}
        className="grid size-5 place-items-center rounded border border-border bg-surface focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <CheckboxPrimitive.Indicator>
          <Check className="size-4" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}
export function Switch({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <SwitchPrimitive.Root
        id={id}
        className="h-6 w-11 rounded-full bg-border data-[state=checked]:bg-brand focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5" />
      </SwitchPrimitive.Root>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
    </div>
  );
}

export const Select = ({
  label,
  value,
  onValueChange,
  items,
}: {
  label: string;
  value?: string;
  onValueChange?: (v: string) => void;
  items: { value: string; label: string }[];
}) => (
  <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
    <SelectPrimitive.Trigger
      aria-label={label}
      className="inline-flex min-h-11 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <SelectPrimitive.Value placeholder={label} />
      <ChevronDown className="size-4" />
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        className="z-50 min-w-40 rounded-md border border-border bg-surface p-1 shadow-elevated"
      >
        <SelectPrimitive.Viewport>
          {items.map((item) => (
            <SelectPrimitive.Item
              key={item.value}
              value={item.value}
              className="relative flex min-h-10 cursor-default items-center rounded px-8 text-sm outline-none focus:bg-muted"
            >
              <SelectPrimitive.ItemIndicator className="absolute start-2">
                <Check className="size-4" />
              </SelectPrimitive.ItemIndicator>
              <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
            </SelectPrimitive.Item>
          ))}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
);

export const Menu = ({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
}) => (
  <Dropdown.Root>
    <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
    <Dropdown.Portal>
      <Dropdown.Content
        aria-label={label}
        align="end"
        className="z-50 min-w-48 rounded-md border border-border bg-surface p-1 shadow-elevated"
      >
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  </Dropdown.Root>
);
export const MenuItem = ({
  children,
  onSelect,
}: {
  children: ReactNode;
  onSelect?: () => void;
}) => (
  <Dropdown.Item
    onSelect={onSelect}
    className="flex min-h-10 cursor-default items-center rounded px-3 text-sm outline-none focus:bg-muted"
  >
    {children}
  </Dropdown.Item>
);

function Overlay({ children, sheet = false }: { children: ReactNode; sheet?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/45 data-[state=open]:animate-in motion-reduce:animate-none" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 border border-border bg-surface shadow-elevated focus:outline-none',
          sheet
            ? 'inset-y-0 start-0 w-[min(88vw,22rem)] p-5'
            : 'start-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl p-6',
        )}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute end-3 top-3 grid size-11 place-items-center rounded-md hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <X className="size-5" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function Dialog({
  trigger,
  title,
  description,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <Overlay>
        <DialogPrimitive.Title className="pe-10 text-xl font-bold">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-2 text-sm text-text-secondary">
          {description}
        </DialogPrimitive.Description>
        {children}
      </Overlay>
    </DialogPrimitive.Root>
  );
}
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <Overlay sheet>
        <DialogPrimitive.Title className="pe-10 text-lg font-bold">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        {children}
      </Overlay>
    </DialogPrimitive.Root>
  );
}
export function ConfirmDialog({
  trigger,
  title,
  description,
  action,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  action: string;
}) {
  return (
    <AlertDialogPrimitive.Root>
      <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/45" />
        <AlertDialogPrimitive.Content className="fixed start-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-6 shadow-elevated">
          <AlertDialogPrimitive.Title className="text-xl font-bold">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm text-text-secondary">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button>{action}</Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
export const Tabs = TabsPrimitive;
