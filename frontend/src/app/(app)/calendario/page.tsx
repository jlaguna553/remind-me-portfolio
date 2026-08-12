'use client';

import { useRouter } from 'next/navigation';
import { useRecordatorios } from '@/hooks/useRecordatorios';
import AgendaSection from '@/components/agenda/AgendaSection';
import type { Recordatorio } from '@/types/db';

export default function CalendarioPage() {
  const router = useRouter();
  const { recordatorios, loading, cancelRecordatorio, pauseRecordatorio, resumeRecordatorio, sendRecordatorioAhora } =
    useRecordatorios();

  return (
    <AgendaSection
      recordatorios={recordatorios}
      loading={loading}
      onCancel={cancelRecordatorio}
      onPause={pauseRecordatorio}
      onResume={resumeRecordatorio}
      onSendNow={sendRecordatorioAhora}
      onDuplicate={(r: Recordatorio) => router.push(`/calendario/nuevo?duplicar=${r.id}`)}
    />
  );
}
