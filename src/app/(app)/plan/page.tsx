import Link from 'next/link';
import {
  Apple,
  ChevronRight,
  Clock,
  Dumbbell,
  Pill,
  Plus,
  Replace,
  UtensilsCrossed,
} from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { formatTimeRange } from '@/lib/domain/time';
import { getActivePlan, getWeeklySchedule } from '@/lib/queries/plan';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { NewMealButton } from '@/components/plan/new-meal-button';
import { PlanMealList, type PlanMealRow } from '@/components/plan/plan-meal-list';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata = { title: 'Plan' };
export const dynamic = 'force-dynamic';

const GROUPS = [
  {
    title: 'Routine',
    links: [
      { href: '/plan/schedule', label: 'Training days & workouts', icon: Dumbbell, hint: 'Which days you train and the usual session' },
      { href: '/plan/timing', label: 'Meal timing', icon: Clock, hint: 'Automatic times around training' },
      { href: '/plan/supplements', label: 'Supplements', icon: Pill, hint: 'Doses and timing' },
    ],
  },
  {
    title: 'Library',
    links: [
      { href: '/plan/foods', label: 'Foods & nutrition', icon: Apple, hint: 'Units, packages, yields, nutrition' },
      { href: '/plan/groups', label: 'Substitutions', icon: Replace, hint: 'Chicken or turkey, berries or banana' },
      { href: '/plan/plans', label: 'Meal plans', icon: UtensilsCrossed, hint: 'Create, copy or switch plans' },
    ],
  },
];

export default async function PlanPage() {
  const user = await requireUser();
  const [plan, { dayTypes }] = await Promise.all([getActivePlan(user.id), getWeeklySchedule(user.id)]);

  const meals: PlanMealRow[] = (plan?.meals ?? []).map((meal) => ({
    id: meal.id,
    name: meal.name,
    timeLabel: meal.defaultTime ? formatTimeRange(meal.defaultTime, meal.windowMinutes) : null,
    isPreWorkout: meal.isPreWorkout,
    isPostWorkout: meal.isPostWorkout,
    active: meal.active,
    dayTypeIds: meal.dayTypeSettings.filter((s) => s.included).map((s) => s.dayTypeId),
    ingredients: meal.ingredients.map((ingredient) => ({
      id: ingredient.id,
      label: ingredient.food?.name ?? ingredient.optionGroup?.name ?? 'Unassigned ingredient',
      optionNames: ingredient.optionGroup ? ingredient.optionGroup.members.map((m) => m.food.name) : null,
      unit: ingredient.unit,
      state: ingredient.state as 'RAW' | 'COOKED' | 'AS_IS',
      required: ingredient.required,
      quantities: Object.fromEntries(ingredient.quantities.map((q) => [q.dayTypeId, q.quantity])),
    })),
  }));

  return (
    <>
      <PageHeader
        title="Plan"
        subtitle={plan ? plan.name : 'No active plan'}
        action={plan ? <NewMealButton mealPlanId={plan.id} dayTypes={dayTypes} /> : null}
      />

      <PageBody>
        {!plan ? (
          <EmptyState
            icon={UtensilsCrossed}
            title="No active meal plan."
            description="Create one to start planning meals."
            action={
              <Button asChild>
                <Link href="/plan/plans">
                  <Plus className="size-4" />
                  Create a plan
                </Link>
              </Button>
            }
          />
        ) : meals.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="This plan has no meals yet." description="Add your first meal to get started." />
        ) : (
          <section className="space-y-2">
            <SectionTitle>Meals</SectionTitle>
            <PlanMealList meals={meals} dayTypes={dayTypes.map((d) => ({ id: d.id, name: d.name, isTraining: d.isTraining }))} />
          </section>
        )}

        {GROUPS.map((group) => (
          <section key={group.title} className="space-y-2">
            <SectionTitle>{group.title}</SectionTitle>
            <Card className="divide-y divide-border">
              {group.links.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
                  >
                    <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-tight">{link.label}</span>
                      <span className="block text-xs text-muted-foreground">{link.hint}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                );
              })}
            </Card>
          </section>
        ))}
      </PageBody>
    </>
  );
}
