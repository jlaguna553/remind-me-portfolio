'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthProvider';
import { useProfile } from '@/hooks/useProfile';
import { useLanguage } from '@/i18n/LanguageProvider';
import { WhatsAppStatusProvider } from '@/lib/WhatsAppStatusProvider';
import { ClientesProvider } from '@/lib/ClientesProvider';
import { RecordatoriosProvider } from '@/lib/RecordatoriosProvider';
import { PlantillasProvider } from '@/lib/PlantillasProvider';
import LoginForm from '@/components/auth/LoginForm';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import AccountStatusBanner from '@/components/AccountStatusBanner';
import RequireWhatsAppConnection from '@/components/RequireWhatsAppConnection';

const NAV_ITEMS = [
  { href: '/', key: 'nav.dashboard' },
  { href: '/contactos', key: 'nav.clientes' },
  { href: '/calendario', key: 'nav.calendario' },
  { href: '/mensajes', key: 'nav.mensajes' },
  { href: '/plantillas', key: 'nav.plantillas' },
  { href: '/logs', key: 'nav.logs' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  if (authLoading || (user && profileLoading)) {
    return <p className="p-6 text-slate-500">{t('common.loading')}</p>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md p-6">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <LoginForm />
      </main>
    );
  }

  if (profile && !profile.activo) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-6">
        <div className="flex justify-end gap-3">
          <LanguageSwitcher />
          <button onClick={signOut} className="text-sm text-slate-500 hover:text-slate-700">
            {t('auth.signOut')}
          </button>
        </div>
        <AccountStatusBanner />
      </main>
    );
  }

  const navItems = profile?.is_admin ? [...NAV_ITEMS, { href: '/admin', key: 'admin.title' }] : NAV_ITEMS;

  return (
    <WhatsAppStatusProvider>
      <RequireWhatsAppConnection>
        <ClientesProvider>
          <RecordatoriosProvider>
            <PlantillasProvider>
              <div className="min-h-screen">
                <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
                  <button
                    type="button"
                    aria-label="menu"
                    onClick={() => setMenuOpen(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-slate-600 hover:bg-slate-100"
                  >
                    ☰
                  </button>
                  <h1 className="text-base font-semibold text-slate-900">{t('app.title')}</h1>
                  <LanguageSwitcher />
                </header>

                {menuOpen && (
                  <div className="fixed inset-0 z-30 flex">
                    <div className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
                    <nav className="relative z-40 flex h-full w-72 max-w-[80vw] flex-col bg-white p-4 shadow-xl">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-lg font-bold text-slate-900">{t('app.title')}</span>
                        <button
                          type="button"
                          aria-label="close"
                          onClick={() => setMenuOpen(false)}
                          className="flex h-8 w-8 items-center justify-center text-xl text-slate-400 hover:text-slate-600"
                        >
                          ×
                        </button>
                      </div>

                      <ul className="flex-1 space-y-1">
                        {navItems.map((item) => {
                          const active = pathname === item.href;
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                onClick={() => setMenuOpen(false)}
                                className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                                  active ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {t(item.key)}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>

                      <div className="mt-4 space-y-1 border-t border-slate-200 pt-4">
                        <Link
                          href="/perfil"
                          onClick={() => setMenuOpen(false)}
                          className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                            pathname === '/perfil' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {t('nav.perfil')}
                        </Link>
                        <button
                          type="button"
                          onClick={signOut}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          {t('auth.signOut')}
                        </button>
                      </div>
                    </nav>
                  </div>
                )}

                <main className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">{children}</main>
              </div>
            </PlantillasProvider>
          </RecordatoriosProvider>
        </ClientesProvider>
      </RequireWhatsAppConnection>
    </WhatsAppStatusProvider>
  );
}
