import { cn } from '@/lib/utils';

interface ProgressRingProps {
  /** 0–100. Values above 100 fill the ring completely. */
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  trackClassName?: string;
  indicatorClassName?: string;
  label?: string;
  sublabel?: string;
  children?: React.ReactNode;
}

/**
 * Circular progress. Pure SVG so it renders on the server with no layout shift
 * and no chart library on the critical path of the Today screen.
 */
export function ProgressRing({
  value,
  size = 92,
  strokeWidth = 9,
  className,
  trackClassName,
  indicatorClassName,
  label,
  sublabel,
  children,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={cn('stroke-secondary', trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('stroke-primary transition-[stroke-dashoffset] duration-700', indicatorClassName)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        {children ?? (
          <>
            {label ? <span className="tabular text-lg font-semibold">{label}</span> : null}
            {sublabel ? <span className="mt-0.5 text-[10px] text-muted-foreground">{sublabel}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}
