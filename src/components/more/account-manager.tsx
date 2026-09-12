'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { changePassword, updateProfile } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import type { ActionResult } from '@/lib/actions/result';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="block" disabled={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionResult<undefined> | null }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success">
        <CheckCircle2 className="size-4 shrink-0" />
        {state.message ?? 'Saved.'}
      </p>
    );
  }
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {state.error}
    </p>
  );
}

export function AccountManager({
  username,
  displayName,
  mustChangePassword,
}: {
  username: string;
  displayName: string | null;
  mustChangePassword: boolean;
}) {
  const [profileState, profileAction] = useActionState(updateProfile, null);
  const [passwordState, passwordAction] = useActionState(changePassword, null);

  return (
    <div className="space-y-4">
      {mustChangePassword ? (
        <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
          You are still using the password created during setup. Change it before exposing PrepTracker
          to anything beyond this machine.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={profileAction} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" name="displayName" defaultValue={displayName ?? ''} />
            </div>
            <Feedback state={profileState} />
            <SubmitButton label="Save profile" />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={passwordAction} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <Feedback state={passwordState} />
            <SubmitButton label="Change password" />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
