import { NextRequest, NextResponse } from 'next/server';

// Proxy server-side: reenvía el Authorization (Bearer <access_token de Supabase
// del usuario>) al backend, que valida ese token para saber de quién es la
// sesión de WhatsApp que se está consultando.
export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const res = await fetch(`${process.env.BACKEND_URL}/api/whatsapp/session/status`, {
    headers: { authorization },
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
