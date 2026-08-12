import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const authorization = request.headers.get('authorization') ?? '';
  const res = await fetch(`${process.env.BACKEND_URL}/api/reminders/${params.id}/send-now`, {
    method: 'POST',
    headers: { authorization },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
