'use client';
import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2, X, ChevronDown, Search } from 'lucide-react';

// ─── Button ──────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}
export function Button({
  variant = 'primary', size = 'md', loading, icon, children,
  className, disabled, ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 ease-out disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';
  const variants = {
    primary: 'bg-cyan-500 text-white hover:bg-cyan-400 active:bg-cyan-600 focus-visible:ring-cyan-500 shadow-subtle hover:shadow-glow',
    secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--accent))] focus-visible:ring-ring border border-[hsl(var(--border))]',
    ghost: 'text-muted-foreground hover:bg-[hsl(var(--accent))] hover:text-foreground focus-visible:ring-ring',
    danger: 'bg-red-600/80 text-white hover:bg-red-500/90 active:bg-red-700 focus-visible:ring-red-500 shadow-subtle',
    outline: 'border border-[hsl(var(--border))] text-foreground hover:bg-[hsl(var(--accent))] hover:border-cyan-500/30 focus-visible:ring-ring',
  };
  const sizes = { sm: 'text-xs px-3 py-1.5 h-8', md: 'text-sm px-4 py-2 h-10', lg: 'text-sm px-5 py-2.5 h-11' };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────
interface BadgeProps { children: React.ReactNode; color?: string; dot?: boolean; className?: string; }
export function Badge({ children, color, dot, className }: BadgeProps) {
  return (
    <span className={cn('status-badge', color, className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />}
      {children}
    </span>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
interface CardProps { children: React.ReactNode; className?: string; hover?: boolean; padding?: 'none' | 'sm' | 'md' | 'lg'; id?: string; }
export function Card({ children, className, hover, padding = 'md', id }: CardProps) {
  const paddings = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };
  return (
    <div className={cn(
      'rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-subtle transition-all duration-200',
      hover && 'card-hover',
      paddings[padding],
      className,
    )} id={id}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between mb-4', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('font-semibold text-sm text-foreground tracking-tight', className)}>{children}</h3>;
}

// ─── Input ───────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string; leftIcon?: React.ReactNode; rightElement?: React.ReactNode;
}
const InputInner = function InputInner(
  { label, error, hint, leftIcon, rightElement, className, id, ...props }: InputProps,
  ref: React.ForwardedRef<HTMLInputElement>,
) {
  const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label} {props.required && <span className="text-red-400">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{leftIcon}</div>}
        <input
          ref={ref} id={inputId}
          className={cn(
            'w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
            'text-sm text-foreground placeholder:text-muted-foreground/50',
            'px-3.5 py-2.5 h-10 transition-all duration-200',
            'hover:border-[hsl(var(--muted-foreground))]/30',
            'focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            error && 'border-red-400/50 focus:border-red-400 focus:ring-red-400/20',
            leftIcon && 'pl-10', rightElement && 'pr-10',
            className,
          )}
          {...props}
        />
        {rightElement && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</div>}
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
};
export const Input = React.forwardRef(InputInner);

// ─── Textarea ────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; error?: string; }
export function Textarea({ label, error, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>}
      <textarea
        className={cn(
          'w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
          'text-sm text-foreground placeholder:text-muted-foreground/50',
          'px-3.5 py-2.5 transition-all duration-200 resize-none',
          'hover:border-[hsl(var(--muted-foreground))]/30',
          'focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50',
          error && 'border-red-400/50', className,
        )}
        rows={4} {...props}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

// ─── Select ──────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; error?: string; options: Array<{ value: string; label: string }>; placeholder?: string;
}
const SelectInner = function SelectInner(
  { label, error, options, placeholder, className, ...props }: SelectProps,
  ref: React.ForwardedRef<HTMLSelectElement>,
) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">{label} {props.required && <span className="text-red-400">*</span>}</label>}
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'w-full appearance-none rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
            'text-sm text-foreground px-3.5 py-2.5 h-10 pr-9 transition-all duration-200',
            'hover:border-[hsl(var(--muted-foreground))]/30',
            'focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50',
            error && 'border-red-400/50', className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
};
export const Select = React.forwardRef(SelectInner);

// ─── Modal ───────────────────────────────────────────────────────────────────
interface ModalProps { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'; footer?: React.ReactNode; }
export function Modal({ open, onClose, title, children, size = 'md', footer }: ModalProps) {
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl', '2xl': 'max-w-4xl' };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        'relative w-full rounded-2xl shadow-glass animate-scale-in',
        'bg-[hsl(var(--card))] border border-[hsl(var(--border))]',
        sizes[size],
      )}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))]">
            <h2 className="font-semibold text-base text-foreground">{title}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[hsl(var(--accent))] text-muted-foreground hover:text-foreground transition-colors duration-150">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-[hsl(var(--border))] flex items-center justify-end gap-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}
export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => <Skeleton key={j} className="h-10 flex-1" />)}
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: {
  icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {icon && <div className="text-muted-foreground/25 mb-5">{icon}</div>}
      <h3 className="font-semibold text-sm text-foreground mb-1.5">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
export function StatCard({ label, value, change, icon, color, loading, title, className }: {
  label?: string; title?: string; value: number | string; change?: { value: number; label: string };
  icon: React.ReactNode; color?: string; loading?: boolean; className?: string;
}) {
  const displayLabel = label || title || '';
  return (
    <div className={cn("stat-card group", className)}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn('p-2.5 rounded-xl transition-colors duration-200', color || 'bg-cyan-500/10')}>{icon}</div>
        {change && (
          <span className={cn(
            'text-[11px] font-semibold px-2 py-0.5 rounded-md',
            change.value >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400',
          )}>
            {change.value >= 0 ? '+' : ''}{change.value} {change.label}
          </span>
        )}
      </div>
      {loading ? <Skeleton className="h-8 w-24 mb-1" /> : (
        <p className="text-2xl font-bold text-foreground tracking-tight leading-none">{value}</p>
      )}
      <p className="text-xs text-muted-foreground mt-1.5 font-medium">{displayLabel}</p>
    </div>
  );
}

// ─── Confirm Modal ───────────────────────────────────────────────────────────
export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Onayla', loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>İptal</Button><Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>}
    >
      <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
    </Modal>
  );
}

// ─── Page Header ─────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children?: React.ReactNode; }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="font-bold text-xl text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {(actions || children) && <div className="flex items-center gap-2">{actions || children}</div>}
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }: {
  tabs: Array<{ key: string; label: string; count?: number }>; active: string; onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-0.5 p-1 bg-[hsl(var(--muted))] rounded-xl w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.key} onClick={() => onChange(tab.key)}
          className={cn(
            'px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-200',
            active === tab.key
              ? 'bg-[hsl(var(--card))] text-foreground shadow-subtle'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn(
              'ml-1.5 text-[11px] px-1.5 py-0.5 rounded-md font-semibold',
              active === tab.key ? 'bg-cyan-500/10 text-cyan-400' : 'bg-[hsl(var(--border))] text-muted-foreground',
            )}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Search Input ────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Ara...', className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
      <input
        type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={cn(
          'w-full pl-10 pr-3.5 py-2.5 h-10 rounded-lg',
          'border border-[hsl(var(--border))] bg-[hsl(var(--background))]',
          'text-sm text-foreground placeholder:text-muted-foreground/40',
          'hover:border-[hsl(var(--muted-foreground))]/30',
          'focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50',
          'transition-all duration-200',
        )}
      />
    </div>
  );
}
