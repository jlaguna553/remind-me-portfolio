export interface CountryCode {
  code: string;
  label: string;
  flag: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: '+52', label: 'México', flag: '🇲🇽' },
  { code: '+1', label: 'EE.UU. / Canadá', flag: '🇺🇸' },
  { code: '+34', label: 'España', flag: '🇪🇸' },
  { code: '+54', label: 'Argentina', flag: '🇦🇷' },
  { code: '+57', label: 'Colombia', flag: '🇨🇴' },
  { code: '+56', label: 'Chile', flag: '🇨🇱' },
  { code: '+51', label: 'Perú', flag: '🇵🇪' },
  { code: '+58', label: 'Venezuela', flag: '🇻🇪' },
  { code: '+593', label: 'Ecuador', flag: '🇪🇨' },
  { code: '+502', label: 'Guatemala', flag: '🇬🇹' },
  { code: '+503', label: 'El Salvador', flag: '🇸🇻' },
  { code: '+504', label: 'Honduras', flag: '🇭🇳' },
  { code: '+505', label: 'Nicaragua', flag: '🇳🇮' },
  { code: '+506', label: 'Costa Rica', flag: '🇨🇷' },
  { code: '+507', label: 'Panamá', flag: '🇵🇦' },
  { code: '+591', label: 'Bolivia', flag: '🇧🇴' },
  { code: '+595', label: 'Paraguay', flag: '🇵🇾' },
  { code: '+598', label: 'Uruguay', flag: '🇺🇾' },
];

// Más largos primero: evita que "+1" (o cualquier código corto) le "gane" a
// un código de más dígitos que también empiece igual al hacer match por prefijo.
export const COUNTRY_CODES_BY_LENGTH = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
