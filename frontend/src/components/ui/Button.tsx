'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const base =
  'inline-flex items-center justify-center font-body font-bold uppercase tracking-widest transition-all duration-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ff5b00]/50 disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<string, string> = {
  primary:
    'bg-[#ff5b00] text-black hover:bg-[#ff7f3a] shadow-lg hover:shadow-[0_8px_30px_rgba(255,91,0,0.25)]',
  secondary:
    'bg-white/10 text-white hover:bg-white/20 border border-white/10',
  ghost: 'text-white/60 hover:text-white hover:bg-white/5',
};

const sizes: Record<string, string> = {
  sm: 'text-[10px] px-4 py-2 rounded-[70px] gap-1.5',
  md: 'text-xs px-6 py-3 rounded-[70px] gap-2',
  lg: 'text-sm px-8 py-4 rounded-[70px] gap-2.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
