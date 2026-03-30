'use client';
import dynamic from 'next/dynamic';

const AppLayout = dynamic(
  () => import('@/components/layout/AppLayout').then(mod => ({ default: mod.AppLayout })),
  { ssr: false },
);

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
