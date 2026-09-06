import { redirect } from 'next/navigation';
import { VerifyPhoneForm } from '@/components/auth/VerifyPhoneForm';
import { getSession } from '@/lib/session';

export const metadata = { title: 'Telefonni tasdiqlash' };

export default async function VerifyPhonePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // Already verified → home.
  if (session.isPhoneVerified) redirect('/');

  // DEV-ONLY convenience: pre-fill is not possible without exposing the code
  // server-side; the register response carries otpDev to the client already.
  return <VerifyPhoneForm />;
}
