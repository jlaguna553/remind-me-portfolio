import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? '';
  const res = await fetch(`${process.env.BACKEND_URL}/api/whatsapp/session/groups`, {
    headers: { authorization },
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
