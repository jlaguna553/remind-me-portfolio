'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useClientes } from '@/hooks/useClientes';
import { useRecordatorios } from '@/hooks/useRecordatorios';
import { usePlantillas } from '@/hooks/usePlantillas';
import RecordatorioForm from '@/components/agenda/RecordatorioForm';

function NuevoRecordatorioContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clientes } = useClientes();
  const { recordatorios, addRecordatorio, addRecordatoriosMultiples, addRecordatorioRecurrente } = useRecordatorios();
  const { plantillas, uploadAttachments, addPlantilla } = usePlantillas();

  const duplicarId = searchParams.get('duplicar');
  const duplicateFrom = duplicarId ? recordatorios.find((r) => r.id === duplicarId) ?? null : null;

  return (
    <RecordatorioForm
      clientes={clientes}
      plantillas={plantillas}
      uploadAttachments={uploadAttachments}
      onSaveAsPlantilla={addPlantilla}
      initialClienteId={searchParams.get('cliente')}
      initialFecha={searchParams.get('fecha')}
      duplicateFrom={duplicateFrom}
      onAdd={addRecordatorio}
      onAddMultiple={addRecordatoriosMultiples}
      onAddRecurrente={addRecordatorioRecurrente}
      onDone={() => router.push('/calendario')}
    />
  );
}

export default function NuevoRecordatorioPage() {
  return (
    <Suspense fallback={null}>
      <NuevoRecordatorioContent />
    </Suspense>
  );
}
