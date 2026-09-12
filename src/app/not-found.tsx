import { ErrorScreen } from '@/components/layout/error-screen';

export const metadata = { title: 'Not found' };

/** For paths outside the signed-in group, which have no layout of their own. */
export default function NotFound() {
  return <ErrorScreen title="Page not found" description="There is nothing at this address." />;
}
