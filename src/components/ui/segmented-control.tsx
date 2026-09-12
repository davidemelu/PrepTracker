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
  /** `default` is the 48px control for daily state; `sm` is a 44px view toggle. */
  size?: 'default' | 'sm';
  className?: string;
}

/**
 * A pill segmented control. The active segment is filled and carries a check
 * icon, so the state never depends on colour alone.
 *
 * It is a real ARIA radio group, keyboard pattern included: one tab stop for
 * the whole control, arrow keys to move between segments and Home/End to reach
 * the ends. The alternative — a row of `aria-pressed` buttons — was rejected
 * because these are mutually exclusive choices rather than independent toggles,
 * and because a group of toggles would keep every segment in the tab order. In
 * Shopping Mode that put two extra stops between the item counter and the list.
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
  const buttons = React.useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = options.findIndex((option) => option.value === value);
  // With nothing selected the first segment holds the tab stop, so the control
  // is always reachable.
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  /** Selection follows focus, which is the expected behaviour for a radio group. */
  const focusAt = (index: number) => {
    const option = options[index];
    if (!option) return;
    buttons.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusAt(index === last ? 0 : index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusAt(index === 0 ? last : index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(last);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={rest['aria-label']}
      className={cn(
        'flex gap-1 rounded-full bg-muted p-1',
        size === 'default' ? 'h-12' : 'h-11',
        disabled && 'opacity-60',
        className,
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => !active && onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              size === 'default' ? 'text-[15px]' : 'text-sm',
              active
                ? cn('bg-primary text-primary-foreground shadow-sm', option.activeClassName)
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {active ? <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden /> : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
