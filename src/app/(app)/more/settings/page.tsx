import { requireUser } from '@/lib/auth/guards';
import { getSettings } from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { SettingsManager } from '@/components/more/settings-manager';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getSettings(user.id);

  return (
    <>
      <PageHeader title="Settings" subtitle="Water, storage and reminders" backHref="/more" />
      <PageBody>
        <SettingsManager
          initial={{
            waterTargetMl: settings.waterTargetMl,
            quickAddAMl: settings.quickAddAMl,
            quickAddBMl: settings.quickAddBMl,
            fridgeDays: settings.fridgeDays,
            freezerThawLeadDays: settings.freezerThawLeadDays,
            defaultPortionG: settings.defaultPortionG,
            defaultPlanDays: settings.defaultPlanDays,
            seasoningNote: settings.seasoningNote,
            notificationsEnabled: settings.notificationsEnabled,
          }}
        />
      </PageBody>
    </>
  );
}
