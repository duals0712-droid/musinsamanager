import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const isValidUrl = !!supabaseUrl && /^https?:\/\//i.test(supabaseUrl);
const isValidKey = !!supabaseAnonKey;

export const supabase: SupabaseClient | null =
  isValidUrl && isValidKey ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

export const isSupabaseConfigured = Boolean(supabase);
