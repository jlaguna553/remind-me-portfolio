'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useClientes } from '@/hooks/useClientes';
import ContactosSection from '@/components/contactos/ContactosSection';

function ContactosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clientes, loading, addCliente, addClientesBulk, updateCliente, removeCliente } = useClientes();

  function handleSchedule(clienteId: string) {
    router.push(`/calendario/nuevo?cliente=${clienteId}`);
  }

  const tab = searchParams.get('tab');

  return (
    <ContactosSection
      clientes={clientes}
      loading={loading}
      initialTab={tab === 'grupos' ? 'grupos' : 'contactos'}
      onAdd={addCliente}
      onAddBulk={addClientesBulk}
      onUpdate={updateCliente}
      onRemove={removeCliente}
      onSchedule={handleSchedule}
    />
  );
}

export default function ContactosPage() {
  return (
    <Suspense fallback={null}>
      <ContactosPageContent />
    </Suspense>
  );
}
