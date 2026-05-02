import { redirect } from 'next/navigation';

export default function NoAccess() {
  redirect('/login');
}