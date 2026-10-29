import { NextResponse } from 'next/server';
import { ExecutionDispatcher } from '@/lib/engine/dispatcher';
import { OrderSide } from '@/lib/engine/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      side = 'BUY',
      sizeUSD = 5000,
      horizonSeconds = 30,
      riskAversion = 0.05,
    } = body;

    const dispatcher = new ExecutionDispatcher();
    const report = await dispatcher.executeBlockOrder(
      side as OrderSide,
      Number(sizeUSD),
      Number(horizonSeconds),
      Number(riskAversion)
    );

    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
