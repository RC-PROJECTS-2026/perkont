import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'react-hot-toast';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: { template: '%s | PerKont', default: 'PerKont — Periyodik Kontrol Sistemi' },
  description: 'Akredite İş Ekipmanları Periyodik Kontrol Yönetim Sistemi',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <Providers>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '500',
                },
              }}
            />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
