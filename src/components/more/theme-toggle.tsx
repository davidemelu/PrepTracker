'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/** Labelled segmented theme control. Lives in Settings → Appearance. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // The server cannot know the resolved theme, so the control renders only after
  // hydration rather than flashing the wrong selection.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) return <div className="h-12 w-full rounded-full bg-muted" aria-hidden />;

  return (
    <div role="radiogroup" aria-label="Theme" className="flex h-12 gap-1 rounded-full bg-muted p-1">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors',
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
