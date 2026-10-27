import { redirect } from 'next/navigation';

// The account dashboard is a popup opened from the terminal navigation.
export default function AccountPage() {
  redirect('/options-flow');
}
