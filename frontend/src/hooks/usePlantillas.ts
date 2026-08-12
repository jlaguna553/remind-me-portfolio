'use client';

import { usePlantillasContext } from '@/lib/PlantillasProvider';

/** Ver PlantillasProvider — los datos viven ahí para no perderse al navegar entre páginas. */
export function usePlantillas() {
  return usePlantillasContext();
}
