'use client';

import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useClientes } from '@/hooks/useClientes';
import { useRecordatorios } from '@/hooks/useRecordatorios';
import { usePlantillas } from '@/hooks/usePlantillas';
import RecordatorioForm from '@/components/agenda/RecordatorioForm';

export default function EditarRecordatorioPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { clientes } = useClientes();
  const { recordatorios, loading, updateRecordatorio } = useRecordatorios();
  const { uploadAttachments } = usePlantillas();

  const reminder = recordatorios.find((r) => r.id === params.id);

  if (loading) {
    return <p className="text-sm text-slate-400">{t('common.loading')}</p>;
  }

  if (!reminder) {
    return <p className="text-sm text-slate-500">{t('recordatorios.notFound')}</p>;
  }

  return (
    <RecordatorioForm
      clientes={clientes}
      uploadAttachments={uploadAttachments}
      editingReminder={reminder}
      onUpdate={updateRecordatorio}
      onDone={() => router.push('/calendario')}
    />
  );
}
