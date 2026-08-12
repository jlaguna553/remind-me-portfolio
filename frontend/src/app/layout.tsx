import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LanguageProvider } from '@/i18n/LanguageProvider';
import { AuthProvider } from '@/lib/AuthProvider';
import RegisterSW from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Remind-me',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Remind-me',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <LanguageProvider>
          <AuthProvider>
            <RegisterSW />
            {children}
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
