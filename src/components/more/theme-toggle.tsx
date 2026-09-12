'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/segmented-control';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/**
 * Labelled segmented theme control. Lives in Settings, under Appearance.
 *
 * Built on the shared control rather than its own row of buttons, which is how
 * it came to be the one radio group in the app without arrow-key support: every
 * segment was a separate tab stop and the arrows did nothing.
 */
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
    <SegmentedControl
      aria-label="Theme"
      options={OPTIONS}
      value={theme ?? 'system'}
      onChange={setTheme}
    />
  );
}
