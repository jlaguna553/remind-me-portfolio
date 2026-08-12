'use client';

import { usePlantillas } from '@/hooks/usePlantillas';
import PlantillasSection from '@/components/plantillas/PlantillasSection';

export default function PlantillasPage() {
  const { plantillas, loading, uploadAttachments, addPlantilla, updatePlantilla, removePlantilla } = usePlantillas();

  return (
    <PlantillasSection
      plantillas={plantillas}
      loading={loading}
      uploadAttachments={uploadAttachments}
      onAdd={addPlantilla}
      onUpdate={updatePlantilla}
      onRemove={removePlantilla}
    />
  );
}
