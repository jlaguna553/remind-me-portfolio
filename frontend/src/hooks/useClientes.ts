'use client';

import { useClientesContext } from '@/lib/ClientesProvider';

/** Ver ClientesProvider — los datos viven ahí para no perderse al navegar entre páginas. */
export function useClientes() {
  return useClientesContext();
}
