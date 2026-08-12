'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthProvider';
import type { Plantilla } from '@/types/db';

const SELECT_FIELDS = 'id, nombre, mensaje, imagenes_urls, created_at, updated_at';

interface PlantillasContextValue {
  plantillas: Plantilla[];
  loading: boolean;
  uploadAttachment: (file: File) => Promise<{ url: string | null; error: string | null }>;
  uploadAttachments: (files: File[]) => Promise<{ urls: string[]; error: string | null }>;
  addPlantilla: (nombre: string, mensaje: string, imagenesUrls?: string[]) => Promise<{ error: string | null }>;
  updatePlantilla: (
    id: string,
    nombre: string,
    mensaje: string,
    imagenesUrls: string[]
  ) => Promise<{ error: string | null }>;
  removePlantilla: (id: string) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

const PlantillasContext = createContext<PlantillasContextValue | null>(null);

/** Ver ClientesProvider — mismo motivo: que navegar entre páginas no vuelva a pedir todo desde cero. */
export function PlantillasProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('plantillas')
      .select(SELECT_FIELDS)
      .order('created_at', { ascending: false });
    if (!error && data) setPlantillas(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Sube una imagen al bucket público 'attachments', en la carpeta del
  // usuario (lo exige la policy de storage.objects). Devuelve la URL
  // pública lista para guardar en plantillas/recordatorios.
  async function uploadAttachment(file: File) {
    if (!user) return { url: null, error: 'No hay sesión activa' };
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file);
    if (uploadError) return { url: null, error: uploadError.message };
    const { data } = supabase.storage.from('attachments').getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  }

  // Sube varias imágenes en secuencia (una subida a la vez, no en paralelo,
  // para no saturar la conexión del navegador con adjuntos grandes). Se
  // detiene en el primer error y lo reporta junto con las URLs que sí se
  // alcanzaron a subir, para que quien llama decida si continúa o no.
  async function uploadAttachments(files: File[]) {
    const urls: string[] = [];
    for (const file of files) {
      const { url, error } = await uploadAttachment(file);
      if (error || !url) return { urls, error };
      urls.push(url);
    }
    return { urls, error: null };
  }

  async function addPlantilla(nombre: string, mensaje: string, imagenesUrls: string[] = []) {
    if (!user) return { error: 'No hay sesión activa' };
    const { error } = await supabase.from('plantillas').insert({
      nombre,
      mensaje,
      imagenes_urls: imagenesUrls,
      user_id: user.id,
    });
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  async function updatePlantilla(id: string, nombre: string, mensaje: string, imagenesUrls: string[]) {
    const { error } = await supabase
      .from('plantillas')
      .update({ nombre, mensaje, imagenes_urls: imagenesUrls })
      .eq('id', id);
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  async function removePlantilla(id: string) {
    const { error } = await supabase.from('plantillas').delete().eq('id', id);
    if (!error) await refresh();
    return { error: error?.message ?? null };
  }

  return (
    <PlantillasContext.Provider
      value={{ plantillas, loading, uploadAttachment, uploadAttachments, addPlantilla, updatePlantilla, removePlantilla, refresh }}
    >
      {children}
    </PlantillasContext.Provider>
  );
}

export function usePlantillasContext() {
  const ctx = useContext(PlantillasContext);
  if (!ctx) throw new Error('usePlantillasContext debe usarse dentro de PlantillasProvider');
  return ctx;
}
