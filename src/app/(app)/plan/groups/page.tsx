import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { startOfWeek, toDbDate, todayKey } from '@/lib/domain/dates';
import { getFoodPickerOptions, getOptionGroups, getSettings } from '@/lib/queries/plan';
import { PageBody, PageHeader } from '@/components/layout/page-header';
import { GroupsManager, type GroupRow } from '@/components/plan/groups-manager';

export const metadata = { title: 'Substitutions' };
export const dynamic = 'force-dynamic';

export default async function GroupsPage() {
  const user = await requireUser();

  const settings = await getSettings(user.id);
  const weekStart = startOfWeek(todayKey(), settings.weekStartsOn);

  const [groups, foods, weekPrefs] = await Promise.all([
    getOptionGroups(user.id),
    getFoodPickerOptions(user.id),
    prisma.planWeekPreference.findMany({
      where: { userId: user.id, weekStart: toDbDate(weekStart) },
    }),
  ]);

  const rows: GroupRow[] = groups.map((group) => ({
    id: group.id,
    name: group.name,
    notes: group.notes,
    preferredFoodId: group.preferredFoodId,
    usageCount: group._count.mealIngredients,
    members: group.members.map((m) => ({ id: m.food.id, name: m.food.name })),
  }));

  return (
    <>
      <PageHeader
        title="Substitutions"
        subtitle="Choose which option you want this week"
        backHref="/plan"
      />
      <PageBody>
        <GroupsManager
          groups={rows}
          foods={foods.map((f) => ({ id: f.id, name: f.name }))}
          weekStart={weekStart}
          weekPreferences={Object.fromEntries(weekPrefs.map((p) => [p.optionGroupId, p.foodId]))}
        />
      </PageBody>
    </>
  );
}
