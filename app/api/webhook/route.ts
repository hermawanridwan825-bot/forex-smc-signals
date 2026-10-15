import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const cleanedUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseUrl = cleanedUrl.startsWith('http') ? cleanedUrl : 'https://placeholder.supabase.co';
const supabaseKey = rawKey.length > 0 ? rawKey : 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  return NextResponse.json({
    status: 'online',
    message: 'SMC ICT Signal Webhook Endpoint is ready to receive TradingView alerts.',
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Verify secret if set in environment variable
    const expectedSecret = process.env.WEBHOOK_SECRET_KEY;
    if (expectedSecret && body.secret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid webhook secret token' },
        { status: 401 }
      );
    }

    // Required fields check
    if (!body.pair || !body.action || !body.entry || !body.sl || !body.tp1) {
      return NextResponse.json(
        { error: 'Missing required fields: pair, action, entry, sl, tp1 are required' },
        { status: 400 }
      );
    }

    const payload = {
      pair: String(body.pair).toUpperCase().replace('/', ''),
      action: String(body.action).toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
      entry_price: parseFloat(body.entry),
      stop_loss: parseFloat(body.sl),
      take_profit_1: parseFloat(body.tp1),
      take_profit_2: body.tp2 ? parseFloat(body.tp2) : null,
      timeframe: body.timeframe || '15m',
      setup_name: body.setup || 'SMC Liquidity Sweep + FVG',
      status: 'ACTIVE',
      pips_result: 0
    };

    const { data, error } = await supabase
      .from('signals')
      .insert([payload])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Signal successfully recorded to Supabase!',
      signal: data?.[0] || payload
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
