import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const body = await request.text();
  const res = await fetch(`${process.env.BACKEND_URL}/api/whatsapp/session/pairing-code`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
