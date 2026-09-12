'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SegmentedOption {
  value: string;
  label: string;
  /** Classes for the active segment, e.g. a different fill per day type. */
  activeClassName?: string;
}

interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string | null;
  onChange: (value: string) => void;
  'aria-label': string;
  disabled?: boolean;
  /** `default` is the 48px control for daily state; `sm` is a 36px view toggle. */
  size?: 'default' | 'sm';
  className?: string;
}

/**
 * A pill segmented control. The active segment is filled and carries a check
 * icon, so the state never depends on colour alone. Renders as a radio group
 * for keyboard and screen-reader users.
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
  size = 'default',
  className,
  ...rest
}: SegmentedControlProps) {
  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      className={cn(
        'flex gap-1 rounded-full bg-muted p-1',
        size === 'default' ? 'h-12' : 'h-9',
        disabled && 'opacity-60',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(option.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-full font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              size === 'default' ? 'text-[15px]' : 'text-sm',
              active
                ? cn('bg-primary text-primary-foreground shadow-sm', option.activeClassName)
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
