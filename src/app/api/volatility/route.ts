import { NextResponse } from 'next/server';
import { StorkOracleConnector } from '@/lib/connectors/stork';

export async function GET() {
  const stork = new StorkOracleConnector();
  const volData = await stork.getRealizedVolatility('SOMI');
  return NextResponse.json({ success: true, data: volData });
}
