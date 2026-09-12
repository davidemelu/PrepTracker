'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { addPrepTask, togglePrepTask } from '@/lib/actions/prep';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export interface PrepTaskRow {
  id: string;
  title: string;
  kind: string;
  targetQty: number | null;
  unit: string | null;
  notes: string | null;
  done: boolean;
}

export function PrepTasks({
  prepSessionId,
  tasks,
}: {
  prepSessionId: string;
  tasks: PrepTaskRow[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');

  const toggle = useAction(togglePrepTask, { successToast: false, onSuccess: () => router.refresh() });
  const add = useAction(addPrepTask, {
    onSuccess: () => {
      setTitle('');
      router.refresh();
    },
  });

  return (
    <div className="space-y-2">
      <Card className="divide-y divide-border">
        {tasks.map((task) => (
          <label
            key={task.id}
            className={cn(
              'flex min-h-14 cursor-pointer items-center gap-3 p-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/30',
              task.done && 'opacity-60',
            )}
          >
            <Checkbox
              size="lg"
              checked={task.done}
              disabled={toggle.isPending}
              onCheckedChange={(checked) => toggle.run({ id: task.id, done: checked === true })}
            />
            <span className="min-w-0 flex-1">
              <span className={cn('block font-medium leading-tight', task.done && 'line-through')}>
                {task.title}
              </span>
              {task.notes ? (
                <span className="block text-xs text-muted-foreground">{task.notes}</span>
              ) : null}
            </span>
          </label>
        ))}
        {tasks.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No tasks yet.</p>
        ) : null}
      </Card>

      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && title.trim()) {
              add.run({ prepSessionId, title } as unknown as Parameters<typeof addPrepTask>[0]);
            }
          }}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Add task"
          disabled={add.isPending || !title.trim()}
          onClick={() => add.run({ prepSessionId, title } as unknown as Parameters<typeof addPrepTask>[0])}
        >
          <Plus className="size-5" />
        </Button>
      </div>
    </div>
  );
}
