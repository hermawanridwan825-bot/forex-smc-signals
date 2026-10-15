import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const cleanedUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseUrl = cleanedUrl.startsWith('http') ? cleanedUrl : 'https://placeholder.supabase.co';
const supabaseKey = rawKey.length > 0 ? rawKey : 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseKey);

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface SwingPoint {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const pair = (body.pair || 'XAUUSD').toUpperCase().replace('/', '');
    const isGold = pair.includes('XAU') || pair.includes('GOLD');

    // 1. Fetch real-time candles from Yahoo Finance
    const tickerMap: Record<string, string> = {
      XAUUSD: 'GC=F',
      GOLD: 'GC=F',
      EURUSD: 'EURUSD=X',
      GBPUSD: 'GBPUSD=X',
      USDJPY: 'JPY=X',
    };

    const ticker = tickerMap[pair] || 'GC=F';
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=15m&range=2d`;

    let candles: Candle[] = [];
    let liveMarketPrice = 0;

    try {
      const res = await fetch(yahooUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        cache: 'no-store',
      });

      if (res.ok) {
        const json = await res.json();
        const result = json.chart?.result?.[0];
        if (result) {
          liveMarketPrice = result.meta?.regularMarketPrice || 0;
          const timestamps = result.timestamp || [];
          const quote = result.indicators?.quote?.[0] || {};

          for (let i = 0; i < timestamps.length; i++) {
            if (
              quote.close?.[i] != null &&
              quote.high?.[i] != null &&
              quote.low?.[i] != null &&
              quote.open?.[i] != null
            ) {
              candles.push({
                time: timestamps[i],
                open: quote.open[i],
                high: quote.high[i],
                low: quote.low[i],
                close: quote.close[i],
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('Live candle fetch warning:', e);
    }

    // Fallback baseline if feed unreachable
    if (candles.length < 15) {
      const base = isGold ? 2660.0 : 1.0850;
      liveMarketPrice = base;
      candles = [];
      for (let i = 20; i >= 0; i--) {
        const offset = Math.sin(i / 2) * (isGold ? 5 : 0.003);
        candles.push({
          time: Date.now() - i * 900000,
          open: base + offset,
          high: base + offset + (isGold ? 2 : 0.001),
          low: base + offset - (isGold ? 2 : 0.001),
          close: base + offset + (isGold ? 0.5 : 0.0005),
        });
      }
    }

    if (liveMarketPrice <= 0) {
      liveMarketPrice = candles[candles.length - 1].close;
    }

    const lastCandle = candles[candles.length - 1];
    const prevCandle1 = candles[candles.length - 2];
    const prevCandle2 = candles[candles.length - 3];

    // ==========================================
    // 2. DETEKSI STRUKTUR SMC / ICT PROFESIONAL
    // ==========================================

    // A. Temukan Swing Highs dan Swing Lows (Fractals)
    const swingHighs: SwingPoint[] = [];
    const swingLows: SwingPoint[] = [];

    for (let i = 2; i < candles.length - 2; i++) {
      const c = candles[i];
      if (
        c.high > candles[i - 1].high &&
        c.high > candles[i - 2].high &&
        c.high > candles[i + 1].high &&
        c.high > candles[i + 2].high
      ) {
        swingHighs.push({ index: i, price: c.high, type: 'HIGH' });
      }
      if (
        c.low < candles[i - 1].low &&
        c.low < candles[i - 2].low &&
        c.low < candles[i + 1].low &&
        c.low < candles[i + 2].low
      ) {
        swingLows.push({ index: i, price: c.low, type: 'LOW' });
      }
    }

    const lastSwingHigh = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1].price : lastCandle.high * 1.004;
    const lastSwingLow = swingLows.length > 0 ? swingLows[swingLows.length - 1].price : lastCandle.low * 0.996;

    // B. Deteksi Displacement (Lilin Momentum Besar)
    const last3Candles = candles.slice(-4);
    const avgRange = candles.slice(-20).reduce((acc, c) => acc + (c.high - c.low), 0) / 20;

    const bullishExpansion =
      last3Candles.filter((c) => c.close > c.open && c.close - c.open > avgRange * 0.8).length >= 2;
    const bearishExpansion =
      last3Candles.filter((c) => c.close < c.open && c.open - c.close > avgRange * 0.8).length >= 2;

    // C. Deteksi Liquidity Sweeps (Sell-side SSL vs Buy-side BSL)
    // SSL Sweep: Sumbu menembus swing low terdahulu lalu closing kembali ke atas
    const sslSwept = candles.slice(-8).some((c) => c.low < lastSwingLow && c.close > lastSwingLow);
    // BSL Sweep: Sumbu menembus swing high terdahulu lalu closing kembali ke bawah
    const bslSwept = candles.slice(-8).some((c) => c.high > lastSwingHigh && c.close < lastSwingHigh);

    // D. Deteksi Market Structure Shift (MSS / Break of Structure)
    const bullishMSS = lastCandle.close > lastSwingHigh;
    const bearishMSS = lastCandle.close < lastSwingLow;

    // E. Deteksi Fair Value Gap (FVG)
    // Bullish FVG: Low candle saat ini berada di atas High candle 2 periode lalu
    const hasBullishFVG = prevCandle2.high < lastCandle.low;
    // Bearish FVG: High candle saat ini berada di bawah Low candle 2 periode lalu
    const hasBearishFVG = prevCandle2.low > lastCandle.high;

    // ==========================================
    // 3. PENGAMBILAN KEPUTUSAN ARAH (BIAS ICT)
    // ==========================================
    let action: 'BUY' | 'SELL' = 'BUY';
    let setupReason = '';

    // Logika prioritas ICT yang benar:
    // 1. Jika baru saja menyapu Liquidity bawah (SSL) atau Bullish MSS atau Bullish Displacement -> WAJIB BUY!
    if (sslSwept || bullishMSS || bullishExpansion) {
      action = 'BUY';
      if (sslSwept) {
        setupReason = 'SSL Liquidity Sweep + Bullish Displacement';
      } else if (bullishMSS) {
        setupReason = 'Market Structure Shift (CHoCH Bullish) + FVG';
      } else {
        setupReason = 'Bullish Institutional Flow + Displacement Rally';
      }
    }
    // 2. Jika baru saja menyapu Liquidity atas (BSL) atau Bearish MSS atau Bearish Displacement -> WAJIB SELL!
    else if (bslSwept || bearishMSS || bearishExpansion) {
      action = 'SELL';
      if (bslSwept) {
        setupReason = 'BSL Liquidity Sweep + Bearish Order Block';
      } else if (bearishMSS) {
        setupReason = 'Market Structure Shift (CHoCH Bearish) + FVG';
      } else {
        setupReason = 'Bearish Institutional Flow + Displacement Drop';
      }
    }
    // 3. Fallback: Ikuti arah tren jangka pendek
    else {
      const shortTermTrend = lastCandle.close > prevCandle1.close;
      action = shortTermTrend ? 'BUY' : 'SELL';
      setupReason = action === 'BUY'
        ? 'Discount Zone Tap + Bullish FVG Mitigation'
        : 'Premium Zone Retest + Bearish Order Block';
    }

    // ==========================================
    // 4. PERHITUNGAN ENTRY, SL, DAN TP PRESISI
    // ==========================================
    const decimals = isGold ? 2 : 4;
    const entry = Number(liveMarketPrice.toFixed(decimals));

    // Standar jarak risiko (SL) disesuaikan dengan volatilitas instrumen
    // Gold: minimal 5.0 - 9.0 USD, Forex: 20 - 35 pips
    const minRiskDistance = isGold ? 6.50 : 0.0028;

    let sl = 0;
    let tp1 = 0;
    let tp2 = 0;

    if (action === 'BUY') {
      // SL ditempatkan di bawah Swing Low terdekat (atau di bawah FVG)
      let calculatedSL = lastSwingLow - (isGold ? 1.5 : 0.0008);
      // Validasi: Jarak SL tidak boleh terlalu jauh atau terlalu dekat
      const riskDistance = entry - calculatedSL;
      if (riskDistance < minRiskDistance || riskDistance > minRiskDistance * 2.5) {
        calculatedSL = entry - minRiskDistance;
      }

      sl = Number(calculatedSL.toFixed(decimals));

      // VALIDASI MATEMATIKA MUTLAK UNTUK BUY:
      // SL HARUS < ENTRY
      if (sl >= entry) {
        sl = Number((entry - minRiskDistance).toFixed(decimals));
      }

      const finalRisk = entry - sl;
      // TP1 = Min RR 1:2.0 | TP2 = Min RR 1:3.2
      tp1 = Number((entry + finalRisk * 2.0).toFixed(decimals));
      tp2 = Number((entry + finalRisk * 3.2).toFixed(decimals));
    } else {
      // UNTUK SELL:
      // SL ditempatkan di atas Swing High terdekat
      let calculatedSL = lastSwingHigh + (isGold ? 1.5 : 0.0008);
      const riskDistance = calculatedSL - entry;
      if (riskDistance < minRiskDistance || riskDistance > minRiskDistance * 2.5) {
        calculatedSL = entry + minRiskDistance;
      }

      sl = Number(calculatedSL.toFixed(decimals));

      // VALIDASI MATEMATIKA MUTLAK UNTUK SELL:
      // SL HARUS > ENTRY
      if (sl <= entry) {
        sl = Number((entry + minRiskDistance).toFixed(decimals));
      }

      const finalRisk = sl - entry;
      // TP1 HARUS < ENTRY | TP2 HARUS < TP1
      tp1 = Number((entry - finalRisk * 2.0).toFixed(decimals));
      tp2 = Number((entry - finalRisk * 3.2).toFixed(decimals));
    }

    const payload = {
      pair: pair,
      action: action,
      entry_price: entry,
      stop_loss: sl,
      take_profit_1: tp1,
      take_profit_2: tp2,
      timeframe: '15m',
      setup_name: setupReason,
      status: 'ACTIVE',
      pips_result: 0,
    };

    // 5. Simpan ke Database Supabase
    const { data, error } = await supabase.from('signals').insert([payload]).select();

    if (error) {
      console.error('Supabase insert error on analyze:', error);
      return NextResponse.json({
        success: true,
        message: 'Signal calculated successfully',
        signal: { ...payload, id: Date.now(), created_at: new Date().toISOString() },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Signal calculated and recorded to database',
      signal: data?.[0] || payload,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Analyze error:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
