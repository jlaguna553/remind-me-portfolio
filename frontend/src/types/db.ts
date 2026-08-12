export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  categoria: string | null;
  es_grupo: boolean;
  created_at: string;
}

export interface WhatsAppContact {
  phone: string;
  name: string | null;
}

export interface WhatsAppGroup {
  jid: string;
  name: string;
  participantsCount: number;
}

export type EstadoRecordatorio = 'pendiente' | 'en_proceso' | 'enviado' | 'fallido' | 'pausado';

export type Frecuencia = 'diaria' | 'semanal' | 'mensual' | 'personalizada';

export interface Recordatorio {
  id: string;
  cliente_id: string;
  mensaje_plantilla: string;
  fecha_envio: string;
  estado: EstadoRecordatorio;
  error: string | null;
  es_recurrente: boolean;
  frecuencia: Frecuencia | null;
  intervalo_dias: number | null;
  fecha_fin: string | null;
  /** Días de la semana permitidos para las repeticiones (0=domingo..6=sábado). null = sin restricción. */
  dias_permitidos: number[] | null;
  /** Cuándo se reanuda solo un recordatorio 'pausado'. null = pausa indefinida (solo se reanuda a mano). */
  pausado_hasta: string | null;
  ultimo_envio: string | null;
  imagenes_urls: string[];
  clientes?: { nombre: string; telefono: string; es_grupo: boolean } | null;
}

export interface Plantilla {
  id: string;
  nombre: string;
  mensaje: string;
  imagenes_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  activo: boolean;
  is_admin: boolean;
  zona_horaria: string | null;
  created_at: string;
}

export interface AdminUserRow extends Profile {
  total_clientes: number;
  total_recordatorios: number;
}
