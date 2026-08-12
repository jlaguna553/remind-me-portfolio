'use client';

import { useProfile } from '@/hooks/useProfile';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { useLanguage } from '@/i18n/LanguageProvider';

export default function AdminPage() {
  const { t } = useLanguage();
  const { profile, loading: profileLoading } = useProfile();
  const { users, loading: usersLoading, error, setActive } = useAdminUsers();

  if (profileLoading) {
    return <p className="text-sm text-slate-500">{t('common.loading')}</p>;
  }

  if (!profile?.is_admin) {
    return <p className="text-slate-600">{t('admin.notAuthorized')}</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">{t('admin.title')}</h2>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {usersLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2">{t('admin.email')}</th>
                <th className="px-4 py-2">{t('admin.clientes')}</th>
                <th className="px-4 py-2">{t('admin.recordatorios')}</th>
                <th className="px-4 py-2">{t('admin.status')}</th>
                <th className="px-4 py-2">{t('admin.action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-slate-900">
                    {u.email}
                    {u.is_admin && (
                      <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">admin</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{u.total_clientes}</td>
                  <td className="px-4 py-2 text-slate-700">{u.total_recordatorios}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {u.activo ? t('admin.active') : t('admin.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => setActive(u.id, !u.activo)}
                      className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      {u.activo ? t('admin.deactivate') : t('admin.activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
