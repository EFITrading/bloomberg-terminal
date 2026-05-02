import { redirect } from 'next/navigation';

export default function AuthError() {
  redirect('/login');
}