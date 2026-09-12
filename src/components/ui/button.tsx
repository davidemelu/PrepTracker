import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Sizes start at 44px because that is Apple's minimum comfortable tap target,
 * and this app is used with a thumb while holding a pan.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-border bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        /** Primary tint: the quick actions that sit next to a hero button. */
        tonal: 'bg-primary/10 text-primary hover:bg-primary/15',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        success: 'bg-success text-success-foreground hover:bg-success/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4 py-2',
        /** Compact label, still a 44px target. */
        sm: 'h-11 rounded-md px-3 text-sm',
        lg: 'h-13 rounded-xl px-6 text-base',
        /** Full-width primary action, e.g. "Save". */
        block: 'h-12 w-full rounded-xl px-4 text-base',
        /** The three daily actions: Mark eaten and the two water buttons. */
        hero: 'h-13 w-full rounded-xl px-4 text-base',
        icon: 'size-11',
        'icon-sm': 'size-11',
        'icon-lg': 'size-14',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
