'use client';

import { useRecordatoriosContext } from '@/lib/RecordatoriosProvider';

/** Ver RecordatoriosProvider — los datos viven ahí para no perderse al navegar entre páginas. */
export function useRecordatorios() {
  return useRecordatoriosContext();
}
