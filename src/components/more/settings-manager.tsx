'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { updateWaterTarget } from '@/lib/actions/water';
import {
  updateMiscSettings,
  updateQuickAddAmounts,
  updateStorageSettings,
} from '@/lib/actions/settings';
import { formatWater } from '@/lib/domain/water';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NumberInput, Textarea } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';

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
}

export function SettingsManager({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const [water, setWater] = useState(String(initial.waterTargetMl));
  const [quickA, setQuickA] = useState(String(initial.quickAddAMl));
  const [quickB, setQuickB] = useState(String(initial.quickAddBMl));
  const [fridgeDays, setFridgeDays] = useState(String(initial.fridgeDays));
  const [thawLead, setThawLead] = useState(String(initial.freezerThawLeadDays));
  const [portion, setPortion] = useState(String(initial.defaultPortionG));
  const [planDays, setPlanDays] = useState(String(initial.defaultPlanDays));
  const [seasoning, setSeasoning] = useState(initial.seasoningNote ?? '');
  const [notifications, setNotifications] = useState(initial.notificationsEnabled);

  const saveWater = useAction(updateWaterTarget, { onSuccess: refresh });
  const saveQuick = useAction(updateQuickAddAmounts, { onSuccess: refresh });
  const saveStorage = useAction(updateStorageSettings, { onSuccess: refresh });
  const saveMisc = useAction(updateMiscSettings, { onSuccess: refresh });

  /**
   * Browser notifications are opt-in and permission is requested only when the
   * switch is turned on — never on page load.
   */
  const toggleNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setNotifications(false);
      saveMisc.run({ seasoningNote: seasoning, notificationsEnabled: false } as unknown as Parameters<
        typeof updateMiscSettings
      >[0]);
      return;
    }

    if (typeof Notification === 'undefined') {
      toast.error('This browser does not support notifications.');
      return;
    }

    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (permission !== 'granted') {
      toast.error('Notification permission was not granted. In-app reminders still work.');
      return;
    }

    setNotifications(true);
    saveMisc.run({ seasoningNote: seasoning, notificationsEnabled: true } as unknown as Parameters<
      typeof updateMiscSettings
    >[0]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Water</CardTitle>
          <CardDescription>
            Currently {formatWater(initial.waterTargetMl)} a day. Past days keep the target they were
            created with.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="water-target">Daily target (mL)</Label>
            <NumberInput id="water-target" value={water} onChange={(e) => setWater(e.target.value)} />
            {saveWater.fieldErrors.targetMl ? (
              <p className="text-sm text-destructive">{saveWater.fieldErrors.targetMl[0]}</p>
            ) : null}
          </div>
          <Button
            size="block"
            disabled={saveWater.isPending}
            onClick={() =>
              saveWater.run({
                targetMl: Number(water),
                applyToToday: true,
                date: new Date().toISOString().slice(0, 10),
              })
            }
          >
            Save water target
          </Button>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-a">Quick add A (mL)</Label>
              <NumberInput id="quick-a" value={quickA} onChange={(e) => setQuickA(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-b">Quick add B (mL)</Label>
              <NumberInput id="quick-b" value={quickB} onChange={(e) => setQuickB(e.target.value)} />
            </div>
          </div>
          <Button
            variant="outline"
            size="block"
            disabled={saveQuick.isPending}
            onClick={() =>
              saveQuick.run({
                quickAddAMl: Number(quickA),
                quickAddBMl: Number(quickB),
              } as unknown as Parameters<typeof updateQuickAddAmounts>[0])
            }
          >
            Save quick-add buttons
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storage &amp; prep</CardTitle>
          <CardDescription>How long cooked food stays in the fridge before freezing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fridge-days">Days in the fridge</Label>
              <NumberInput
                id="fridge-days"
                value={fridgeDays}
                onChange={(e) => setFridgeDays(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="thaw-lead">Thaw lead (days)</Label>
              <NumberInput id="thaw-lead" value={thawLead} onChange={(e) => setThawLead(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portion">Default portion (g)</Label>
              <NumberInput id="portion" value={portion} onChange={(e) => setPortion(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-days">Days per plan</Label>
              <NumberInput id="plan-days" value={planDays} onChange={(e) => setPlanDays(e.target.value)} />
            </div>
          </div>
          {saveStorage.error ? <p className="text-sm text-destructive">{saveStorage.error}</p> : null}
          <Button
            size="block"
            disabled={saveStorage.isPending}
            onClick={() =>
              saveStorage.run({
                fridgeDays: Number(fridgeDays),
                freezerThawLeadDays: Number(thawLead),
                defaultPortionG: Number(portion),
                defaultPlanDays: Number(planDays),
              } as unknown as Parameters<typeof updateStorageSettings>[0])
            }
          >
            Save storage settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
          <CardDescription>
            In-app reminders always appear on the Today screen. Browser notifications are optional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="flex items-center gap-2 text-sm">
              {notifications ? (
                <Bell className="size-4 text-primary" />
              ) : (
                <BellOff className="size-4 text-muted-foreground" />
              )}
              <span>
                Browser notifications
                <span className="block text-xs text-muted-foreground">
                  Asks for permission when you turn this on. Never required.
                </span>
              </span>
            </span>
            <Switch checked={notifications} onCheckedChange={toggleNotifications} />
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="seasoning">Seasoning note</Label>
            <Textarea
              id="seasoning"
              className="min-h-16"
              value={seasoning}
              onChange={(e) => setSeasoning(e.target.value)}
              placeholder="1/4 tsp pink salt with each meal."
            />
          </div>

          <Button
            variant="outline"
            size="block"
            disabled={saveMisc.isPending}
            onClick={() =>
              saveMisc.run({
                seasoningNote: seasoning,
                notificationsEnabled: notifications,
              } as unknown as Parameters<typeof updateMiscSettings>[0])
            }
          >
            Save
          </Button>
        </CardContent>
      </Card>

      <p className="px-1 pb-2 text-xs text-muted-foreground">
        Meal times live under Plan → Meal timing. Day types and the weekly pattern live under Plan →
        Weekly schedule.
      </p>
    </div>
  );
}
