import { ErrorScreen } from '@/components/layout/error-screen';

export const metadata = { title: 'Not found' };

/**
 * Reached when a page calls `notFound()` — a meal, prep session or grocery week
 * whose id no longer exists, usually because it was deleted on another device
 * or the link is old.
 */
export default function AppNotFound() {
  return (
    <ErrorScreen
      title="That is not here any more"
      description="The meal, list or session this link points at has been deleted or never existed."
    />
  );
}
