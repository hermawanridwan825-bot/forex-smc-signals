import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Clean and sanitize Supabase URL (strip /rest/v1 if user copied REST endpoint)
const cleanedUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseUrl = cleanedUrl.startsWith('http') ? cleanedUrl : 'https://placeholder.supabase.co';
const supabaseAnonKey = rawKey.length > 0 ? rawKey : 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Signal {
  id: number;
  created_at: string;
  pair: string;
  action: 'BUY' | 'SELL';
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2?: number | null;
  timeframe: string;
  setup_name: string;
  status: 'ACTIVE' | 'TP1_HIT' | 'TP2_HIT' | 'SL_HIT' | 'CLOSED';
  pips_result: number;
}
