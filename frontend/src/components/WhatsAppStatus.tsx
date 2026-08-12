'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useWhatsAppStatus } from '@/lib/WhatsAppStatusProvider';
import CountryCodeSelect from '@/components/contactos/CountryCodeSelect';

type LinkMethod = 'qr' | 'code';

export default function WhatsAppStatus() {
  const { t } = useLanguage();
  const { status, qr, connecting, error, connect, requestPairingCode, logout } = useWhatsAppStatus();
  const [linkMethod, setLinkMethod] = useState<LinkMethod>('qr');
  const [countryCode, setCountryCode] = useState('+52');
  const [localNumber, setLocalNumber] = useState('');

  async function handleLogout() {
    if (!window.confirm(t('whatsapp.disconnectConfirm'))) return;
    await logout();
  }

  if (!status) return <p className="text-slate-400">{t('whatsapp.status.loading')}</p>;

  const mostrandoCodigo = !!status.pairingCode;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-slate-900">{t('whatsapp.myNumber')}</h2>
      <p className="font-medium text-slate-900">{t(`whatsapp.status.${status.status}`)}</p>
      {status.status === 'connected' && status.phoneNumber && (
        <p className="text-sm text-slate-500">{status.phoneNumber}</p>
      )}

      {status.status !== 'connected' && (
        <>
          <div className="mt-3 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
            {(['qr', 'code'] as LinkMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setLinkMethod(m)}
                className={`flex-1 rounded-md px-2 py-1 ${
                  linkMethod === m ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-white'
                }`}
              >
                {t(`whatsapp.linkMethod.${m}`)}
              </button>
            ))}
          </div>

          {linkMethod === 'qr' &&
            (qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="WhatsApp QR" className="mt-4 h-56 w-56 rounded-lg border border-slate-200" />
            ) : (
              <button
                onClick={connect}
                disabled={connecting}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {t('whatsapp.connect')}
              </button>
            ))}

          {linkMethod === 'code' && (
            <div className="mt-3 space-y-2">
              {mostrandoCodigo && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-center text-2xl font-bold tracking-[0.3em] text-emerald-800">
                    {status.pairingCode}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">{t('whatsapp.pairingCodeHint')}</p>
                </div>
              )}
              {!mostrandoCodigo && connecting && (
                <p className="text-xs text-slate-400">{t('whatsapp.pairingCodePending')}</p>
              )}
              <div className="flex gap-2">
                <CountryCodeSelect value={countryCode} onChange={setCountryCode} ariaLabel={t('clientes.countryCode')} />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={localNumber}
                  onChange={(e) => setLocalNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('whatsapp.phoneNumberPlaceholder')}
                  className="w-full min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
              {localNumber && (
                <p className="text-xs text-slate-400">
                  {t('whatsapp.confirmNumberPrefix')} {countryCode} {localNumber}
                </p>
              )}
              <button
                onClick={() => requestPairingCode(`${countryCode}${localNumber}`)}
                disabled={connecting || !localNumber.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {mostrandoCodigo ? t('whatsapp.requestNewCode') : t('whatsapp.requestCode')}
              </button>
            </div>
          )}

          <p className="mt-2 text-xs text-slate-400">
            {t('whatsapp.linkingUsesPrefix')}{' '}
            <Link href="/privacidad" target="_blank" className="font-medium text-emerald-600 hover:text-emerald-700">
              {t('auth.privacyLink')}
            </Link>
            .
          </p>
        </>
      )}

      {status.status === 'connected' && (
        <button onClick={handleLogout} className="mt-3 text-sm font-medium text-red-600 hover:text-red-700">
          {t('whatsapp.disconnect')}
        </button>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error || t('whatsapp.connectError')}</p>}

      <p className="mt-2 text-sm text-slate-400">
        {t('whatsapp.queue')}: {status.queueLength}
      </p>
    </div>
  );
}
