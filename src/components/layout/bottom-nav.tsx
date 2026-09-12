'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, ChefHat, MoreHorizontal, ShoppingCart, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/today', label: 'Today', icon: Sun },
  { href: '/plan', label: 'Plan', icon: CalendarDays },
  { href: '/prep', label: 'Prep', icon: ChefHat },
  { href: '/groceries', label: 'Groceries', icon: ShoppingCart },
  { href: '/more', label: 'More', icon: MoreHorizontal },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm safe-bottom"
    >
      <ul className="mx-auto flex max-w-3xl items-stretch">
        {ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className={cn('size-6', active && 'stroke-[2.25]')} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
