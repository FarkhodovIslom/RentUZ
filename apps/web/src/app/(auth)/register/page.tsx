import { RegisterForm } from '@/components/auth/RegisterForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Ro'yxatdan o'tish",
  description: "RentUZda ro'yxatdan o'tib ijara e'lon bering yoki uy ijaraga oling.",
  robots: { index: false },
};

export default function RegisterPage() {
  return <RegisterForm />;
}
