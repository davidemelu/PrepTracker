import Link from 'next/link';
import {
  BarChart3,
  ChevronRight,
  Database,
  History,
  LogOut,
  Package,
  PackageCheck,
  Settings,
  UserRound,
} from 'lucide-react';
import { requireUser } from '@/lib/auth/guards';
import { signOut } from '@/lib/actions/auth';
import { PageBody, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { ThemeToggle } from '@/components/more/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'More' };

const GROUPS = [
  {
    title: 'Kitchen',
    links: [
      { href: '/more/inventory', label: 'Inventory', hint: 'What you have in stock', icon: Package },
      { href: '/more/bulk', label: 'Buy in bulk', hint: 'What is worth stocking up on', icon: PackageCheck },
    ],
  },
  {
    title: 'Insights',
    links: [
      { href: '/more/history', label: 'History', hint: 'Meals, water, supplements, prep', icon: History },
      { href: '/more/analytics', label: 'Analytics', hint: 'Trends and adherence charts', icon: BarChart3 },
    ],
  },
  {
    title: 'App',
    links: [
      { href: '/more/settings', label: 'Settings', hint: 'Water, storage, timing, reminders', icon: Settings },
      { href: '/more/data', label: 'Backup & export', hint: 'JSON and CSV, import a backup', icon: Database },
      { href: '/more/account', label: 'Account', hint: 'Username and password', icon: UserRound },
    ],
  },
];

export default async function MorePage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="More" subtitle={user.displayName ?? user.username} action={<ThemeToggle />} />

      <PageBody>
        {user.mustChangePassword ? (
          <Card className="border-warning/50 bg-warning/5 p-4">
            <p className="text-sm font-medium text-warning">Change your password</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You are still signing in with the default password created during setup.
            </p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/more/account">Change it now</Link>
            </Button>
          </Card>
        ) : null}

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
        ))}

        <form action={signOut}>
          <Button type="submit" variant="outline" size="block">
            <LogOut className="size-4" />
            Sign out
          </Button>
        </form>

        <p className="pb-2 text-center text-xs text-muted-foreground">
          PrepTracker · self-hosted · your data stays on your machine
        </p>
      </PageBody>
    </>
  );
}
