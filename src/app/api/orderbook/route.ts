import { NextResponse } from 'next/server';
import { OrderBookSimulator } from '@/lib/engine/orderbook';

export async function GET() {
  const sim = new OrderBookSimulator(0.9850);
  const book = sim.getBook();
  return NextResponse.json({ success: true, book });
}
