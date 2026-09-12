import { redirect } from 'next/navigation';

/** Workouts now live with the weekly pattern under Training days & workouts. */
export default function WorkoutsPage() {
  redirect('/plan/schedule');
}
