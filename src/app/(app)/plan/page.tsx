import Link from 'next/link';
import {
  Apple,
  CalendarRange,
  ChevronRight,
  Clock,
  Dumbbell,
  Layers,
  Pill,
  Plus,
  Replace,
  UtensilsCrossed,
} from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { formatTimeRange } from '@/lib/domain/time';
import { formatAmount } from '@/lib/domain/units';
import { getActivePlan, getWeeklySchedule } from '@/lib/queries/plan';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { NewMealButton } from '@/components/plan/new-meal-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata = { title: 'Plan' };
export const dynamic = 'force-dynamic';

const LINKS = [
  { href: '/plan/foods', label: 'Foods & nutrition', icon: Apple, hint: 'Units, packages, yields, macros' },
  { href: '/plan/groups', label: 'Substitutions', icon: Replace, hint: 'Chicken or turkey, berries or banana' },
  { href: '/plan/supplements', label: 'Supplements', icon: Pill, hint: 'Doses, timing, training days' },
  { href: '/plan/schedule', label: 'Weekly schedule', icon: CalendarRange, hint: 'Training and rest days' },
  { href: '/plan/workouts', label: 'Workouts', icon: Dumbbell, hint: 'Body parts, splits, weekly routine' },
  { href: '/plan/timing', label: 'Meal timing', icon: Clock, hint: 'Generate times from your day' },
  { href: '/plan/week', label: 'Weekly tracker', icon: Layers, hint: 'Adherence Monday to Sunday' },
  { href: '/plan/plans', label: 'Switch plan', icon: UtensilsCrossed, hint: 'Create, copy or archive plans' },
];

export default async function PlanPage() {
  const user = await requireUser();
  const [plan, { dayTypes }] = await Promise.all([getActivePlan(user.id), getWeeklySchedule(user.id)]);

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
            title="No active meal plan"
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
        ) : (
          <section className="space-y-2">
            <SectionTitle>
              Meals · quantities shown as {dayTypes.map((d) => d.name).join(' / ')}
            </SectionTitle>

            {plan.meals.length === 0 ? (
              <EmptyState
                icon={UtensilsCrossed}
                title="This plan has no meals yet"
                description="Add your first meal to get started."
              />
            ) : (
              plan.meals.map((meal) => {
                const includedDayTypes = dayTypes.filter((dayType) =>
                  meal.dayTypeSettings.some((s) => s.dayTypeId === dayType.id && s.included),
                );

                return (
                  <Link key={meal.id} href={`/plan/meals/${meal.id}`} className="block">
                    <Card className="p-4 transition-colors hover:bg-accent/40">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h3 className="font-semibold leading-tight">{meal.name}</h3>
                            {!meal.active ? <Badge variant="secondary">Inactive</Badge> : null}
                            {meal.isPreWorkout ? <Badge variant="secondary">Pre-workout</Badge> : null}
                            {meal.isPostWorkout ? <Badge variant="secondary">Post-workout</Badge> : null}
                          </div>

                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {meal.defaultTime
                              ? formatTimeRange(meal.defaultTime, meal.windowMinutes)
                              : 'No default time'}
                            {includedDayTypes.length !== dayTypes.length
                              ? ` · ${includedDayTypes.map((d) => d.name).join(', ')} only`
                              : ''}
                          </p>
                        </div>
                        <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
                      </div>

                      <ul className="mt-3 space-y-1">
                        {meal.ingredients.map((ingredient) => {
                          const label =
                            ingredient.food?.name ??
                            ingredient.optionGroup?.name ??
                            'Unassigned ingredient';

                          const quantities = dayTypes.map((dayType) => {
                            const row = ingredient.quantities.find((q) => q.dayTypeId === dayType.id);
                            return row ? formatAmount(row.quantity, ingredient.unit) : '—';
                          });

                          const allSame = new Set(quantities).size === 1;

                          return (
                            <li
                              key={ingredient.id}
                              className="flex items-baseline justify-between gap-3 text-sm"
                            >
                              <span className="min-w-0 flex-1">
                                <span className={ingredient.required ? '' : 'text-muted-foreground'}>
                                  {label}
                                </span>
                                {ingredient.optionGroup ? (
                                  <span className="ml-1.5 text-xs text-muted-foreground">
                                    ({ingredient.optionGroup.members.map((m) => m.food.name).join(' / ')})
                                  </span>
                                ) : null}
                                {ingredient.state !== 'AS_IS' ? (
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    {ingredient.state.toLowerCase()}
                                  </span>
                                ) : null}
                              </span>
                              <span className="tabular shrink-0 font-medium">
                                {allSame ? quantities[0] : quantities.join(' / ')}
                              </span>
                            </li>
                          );
                        })}
                        {meal.ingredients.length === 0 ? (
                          <li className="text-sm text-muted-foreground">No ingredients yet</li>
                        ) : null}
                      </ul>
                    </Card>
                  </Link>
                );
              })
            )}
          </section>
        )}

        <section className="space-y-2">
          <SectionTitle>Set up</SectionTitle>
          <Card className="divide-y divide-border">
            {LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
                >
                  <Icon className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-tight">{link.label}</span>
                    <span className="block text-xs text-muted-foreground">{link.hint}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </Card>
        </section>
      </PageBody>
    </>
  );
}
