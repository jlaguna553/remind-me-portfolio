import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const res = await fetch(`${process.env.BACKEND_URL}/api/whatsapp/session/contacts/resync`, {
    method: 'POST',
    headers: { authorization },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
