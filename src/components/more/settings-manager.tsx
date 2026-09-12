'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, Check, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateWaterTarget } from '@/lib/actions/water';
import {
  updateMiscSettings,
  updateQuickAddAmounts,
  updateStorageSettings,
  updateTimingSettings,
} from '@/lib/actions/settings';
import { formatWater } from '@/lib/domain/water';
import { useAction } from '@/lib/hooks/use-action';
import { ThemeToggle } from '@/components/more/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NumberInput, Textarea } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';

export interface TimingSettings {
  autoScheduleMeals: boolean;
  firstMealTime: string;
  mealIntervalMinutes: number;
  mealIntervalMaxMinutes: number;
  mealDurationMinutes: number;
  workoutTime: string;
  workoutDurationMinutes: number;
  lastMealEarliest: string;
  lastMealLatest: string;
  bedtime: string;
  preWorkoutMinutes: number;
  postWorkoutMinutes: number;
}

export interface SettingsValues {
  waterTargetMl: number;
  quickAddAMl: number;
  quickAddBMl: number;
  fridgeDays: number;
  freezerThawLeadDays: number;
  defaultPortionG: number;
  defaultPlanDays: number;
  seasoningNote: string | null;
  notificationsEnabled: boolean;
  timing: TimingSettings;
}

const timeInputClass =
  'flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </Card>
  );
}

function SaveRow({ pending, saved, onClick, label = 'Save' }: { pending: boolean; saved: boolean; onClick: () => void; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" className="flex-1" disabled={pending} onClick={onClick}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {label}
      </Button>
      <span className={`flex items-center gap-1 text-xs font-medium text-success transition-opacity ${saved ? 'opacity-100' : 'opacity-0'}`} aria-live="polite">
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
        {saved ? 'Saved' : ''}
      </span>
    </div>
  );
}

function Field({ id, label, unit, value, onChange }: { id: string; label: string; unit?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <NumberInput id={id} value={value} onChange={(e) => onChange(e.target.value)} className={unit ? 'pr-12' : undefined} />
        {unit ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  );
}

/**
 * Settings in groups of a few fields each, one save per group with an inline
 * "Saved" state. Everything that is really a plan concept links to Plan.
 */
export function SettingsManager({ initial, weekSummary }: { initial: SettingsValues; weekSummary: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState<string | null>(null);
  const flash = (key: string) => {
    setSaved(key);
    setTimeout(() => setSaved((current) => (current === key ? null : current)), 2000);
    router.refresh();
  };

  const [water, setWater] = useState(String(initial.waterTargetMl));
  const [quickA, setQuickA] = useState(String(initial.quickAddAMl));
  const [quickB, setQuickB] = useState(String(initial.quickAddBMl));
  const [timing, setTiming] = useState({
    ...initial.timing,
    mealIntervalMinutes: String(initial.timing.mealIntervalMinutes),
    mealIntervalMaxMinutes: String(initial.timing.mealIntervalMaxMinutes),
    mealDurationMinutes: String(initial.timing.mealDurationMinutes),
    workoutDurationMinutes: String(initial.timing.workoutDurationMinutes),
    preWorkoutMinutes: String(initial.timing.preWorkoutMinutes),
    postWorkoutMinutes: String(initial.timing.postWorkoutMinutes),
  });
  const [fridgeDays, setFridgeDays] = useState(String(initial.fridgeDays));
  const [thawLead, setThawLead] = useState(String(initial.freezerThawLeadDays));
  const [portion, setPortion] = useState(String(initial.defaultPortionG));
  const [planDays, setPlanDays] = useState(String(initial.defaultPlanDays));
  const [seasoning, setSeasoning] = useState(initial.seasoningNote ?? '');
  const [notifications, setNotifications] = useState(initial.notificationsEnabled);

  const saveWater = useAction(updateWaterTarget, { successToast: false, onSuccess: () => flash('water') });
  const saveQuick = useAction(updateQuickAddAmounts, { successToast: false, onSuccess: () => flash('water') });
  const saveTiming = useAction(updateTimingSettings, { successToast: false, onSuccess: () => flash('timing') });
  const saveStorage = useAction(updateStorageSettings, { successToast: false, onSuccess: () => flash('storage') });
  const saveMisc = useAction(updateMiscSettings, { successToast: false, onSuccess: () => flash('reminders') });

  const setT = <K extends keyof typeof timing>(key: K, value: (typeof timing)[K]) => setTiming((prev) => ({ ...prev, [key]: value }));

  const toggleNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setNotifications(false);
      saveMisc.run({ seasoningNote: seasoning, notificationsEnabled: false } as unknown as Parameters<typeof updateMiscSettings>[0]);
      return;
    }
    if (typeof Notification === 'undefined') {
      toast.error('This browser does not support notifications.');
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      toast.error('Notification permission was not granted. In-app reminders still work.');
      return;
    }
    setNotifications(true);
    saveMisc.run({ seasoningNote: seasoning, notificationsEnabled: true } as unknown as Parameters<typeof updateMiscSettings>[0]);
  };

  return (
    <div className="space-y-4">
      <Group title="Water" description={`Currently ${formatWater(initial.waterTargetMl)} a day. Past days keep the target they had.`}>
        <Field id="water-target" label="Daily target" unit="mL" value={water} onChange={setWater} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="quick-a" label="Quick add A" unit="mL" value={quickA} onChange={setQuickA} />
          <Field id="quick-b" label="Quick add B" unit="mL" value={quickB} onChange={setQuickB} />
        </div>
        {saveWater.fieldErrors.targetMl ? <p className="text-sm text-destructive">{saveWater.fieldErrors.targetMl[0]}</p> : null}
        {saveQuick.error ? <p className="text-sm text-destructive">{saveQuick.error}</p> : null}
        <SaveRow
          pending={saveWater.isPending || saveQuick.isPending}
          saved={saved === 'water'}
          onClick={() => {
            saveWater.run({ targetMl: Number(water), applyToToday: true });
            saveQuick.run({ quickAddAMl: Number(quickA), quickAddBMl: Number(quickB) } as unknown as Parameters<typeof updateQuickAddAmounts>[0]);
          }}
        />
      </Group>

      <Group title="Meals & timing" description="Meal times are worked out from these. Spacing rules are under Plan → Meal timing.">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="first-meal">First meal</Label>
            <input id="first-meal" type="time" value={timing.firstMealTime} onChange={(e) => setT('firstMealTime', e.target.value)} className={timeInputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="usual-training">Usual training</Label>
            <input id="usual-training" type="time" value={timing.workoutTime} onChange={(e) => setT('workoutTime', e.target.value)} className={timeInputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-from">Last meal from</Label>
            <input id="last-from" type="time" value={timing.lastMealEarliest} onChange={(e) => setT('lastMealEarliest', e.target.value)} className={timeInputClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-by">Last meal by</Label>
            <input id="last-by" type="time" value={timing.lastMealLatest} onChange={(e) => setT('lastMealLatest', e.target.value)} className={timeInputClass} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bedtime">Bedtime</Label>
          <input id="bedtime" type="time" value={timing.bedtime} onChange={(e) => setT('bedtime', e.target.value)} className={timeInputClass} />
        </div>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm">
            Automatic meal times
            <span className="block text-xs text-muted-foreground">Re-times each day around training.</span>
          </span>
          <Switch checked={timing.autoScheduleMeals} onCheckedChange={(checked) => setT('autoScheduleMeals', checked)} />
        </label>
        {saveTiming.error ? <p className="text-sm text-destructive">{saveTiming.error}</p> : null}
        <SaveRow
          pending={saveTiming.isPending}
          saved={saved === 'timing'}
          onClick={() => saveTiming.run(timing as unknown as Parameters<typeof updateTimingSettings>[0])}
        />
        <Link href="/plan/timing" className="flex min-h-11 items-center justify-between text-sm font-semibold text-primary">
          Spacing rules and preview
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </Group>

      <Link href="/plan/schedule" className="block">
        <Card className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40">
          <span className="min-w-0 flex-1">
            <span className="block font-medium leading-tight">Training days &amp; workouts</span>
            <span className="block truncate text-xs text-muted-foreground">{weekSummary || 'Set which days you train'}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Card>
      </Link>

      <Group title="Storage & prep" description="How long cooked food stays in the fridge before freezing.">
        <div className="grid grid-cols-2 gap-3">
          <Field id="fridge-days" label="Days in the fridge" value={fridgeDays} onChange={setFridgeDays} />
          <Field id="thaw-lead" label="Thaw lead" unit="days" value={thawLead} onChange={setThawLead} />
          <Field id="portion" label="Default portion" unit="g" value={portion} onChange={setPortion} />
          <Field id="plan-days" label="Days per plan" value={planDays} onChange={setPlanDays} />
        </div>
        {saveStorage.error ? <p className="text-sm text-destructive">{saveStorage.error}</p> : null}
        <SaveRow
          pending={saveStorage.isPending}
          saved={saved === 'storage'}
          onClick={() =>
            saveStorage.run({
              fridgeDays: Number(fridgeDays),
              freezerThawLeadDays: Number(thawLead),
              defaultPortionG: Number(portion),
              defaultPlanDays: Number(planDays),
            } as unknown as Parameters<typeof updateStorageSettings>[0])
          }
        />
      </Group>

      <Group title="Reminders" description="In-app reminders always show on Today. Browser notifications are optional.">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm">
            {notifications ? <Bell className="size-4 text-primary" aria-hidden /> : <BellOff className="size-4 text-muted-foreground" aria-hidden />}
            <span>
              Browser notifications
              <span className="block text-xs text-muted-foreground">Asks for permission when turned on.</span>
            </span>
          </span>
          <Switch checked={notifications} onCheckedChange={toggleNotifications} />
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="seasoning">Seasoning note</Label>
          <Textarea id="seasoning" className="min-h-16" value={seasoning} onChange={(e) => setSeasoning(e.target.value)} placeholder="1/4 tsp pink salt with each meal." />
        </div>
        <SaveRow
          pending={saveMisc.isPending}
          saved={saved === 'reminders'}
          onClick={() => saveMisc.run({ seasoningNote: seasoning, notificationsEnabled: notifications } as unknown as Parameters<typeof updateMiscSettings>[0])}
        />
      </Group>

      <Group title="Appearance">
        <ThemeToggle />
      </Group>
    </div>
  );
}
