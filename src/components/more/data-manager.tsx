'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import { restoreFromBackup } from '@/lib/actions/data';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';

const CSV_EXPORTS = [
  { kind: 'meals', label: 'Meals', hint: 'Every planned and completed meal' },
  { kind: 'water', label: 'Water', hint: 'Every hydration entry' },
  { kind: 'supplements', label: 'Supplements', hint: 'Daily doses and completions' },
  { kind: 'groceries', label: 'Groceries', hint: 'Lists, quantities and purchases' },
  { kind: 'prep', label: 'Prep batches', hint: 'Raw and cooked weights, portions' },
  { kind: 'yields', label: 'Cooking yields', hint: 'Full yield measurement history' },
  { kind: 'inventory', label: 'Inventory', hint: 'Current stock levels' },
];

/**
 * Data ownership. A full JSON backup that restores exactly, plus per-area CSV
 * for anything you want to look at in a spreadsheet.
 */
export function DataManager() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [json, setJson] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');

  const restore = useAction(restoreFromBackup, {
    onSuccess: () => {
      setJson(null);
      setFileName(null);
      setConfirm('');
      if (fileInput.current) fileInput.current.value = '';
    },
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setJson(await file.text());
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="size-4 text-primary" />
            Export
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild size="block">
            {/* A plain link so the browser downloads rather than navigates. */}
            <a href="/api/export/backup" download>
              Download a full JSON backup
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">
            Contains everything: plans, foods, history, prep, groceries and settings. This is the file
            to keep.
          </p>

          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              CSV extracts
            </p>
            {CSV_EXPORTS.map((item) => (
              <a
                key={item.kind}
                href={`/api/export/${item.kind}`}
                download
                className="flex min-h-12 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-accent/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.hint}</span>
                </span>
                <Download className="size-4 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-4 text-primary" />
            Restore
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Restoring replaces everything currently in the app with the contents of the backup. Export a
            fresh backup first if you are not certain.
          </p>
          <p className="text-xs text-muted-foreground">
            Restoring into a fresh install also restores that backup&apos;s account, so you will be signed
            out and should sign back in with the password that account had when the backup was taken.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="backup-file">Backup file</Label>
            <Input
              id="backup-file"
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="pt-2.5"
            />
            {fileName ? (
              <p className="text-xs text-muted-foreground">
                {fileName} · {json ? `${Math.round(json.length / 1024)} KB` : 'reading…'}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="backup-confirm">Type REPLACE to confirm</Label>
            <Input
              id="backup-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="REPLACE"
              autoCapitalize="characters"
              autoCorrect="off"
            />
          </div>

          {restore.error ? <p className="text-sm text-destructive">{restore.error}</p> : null}

          <Button
            variant="destructive"
            size="block"
            disabled={restore.isPending || !json || confirm !== 'REPLACE'}
            onClick={() => json && restore.run({ json, confirm })}
          >
            Restore from backup
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
