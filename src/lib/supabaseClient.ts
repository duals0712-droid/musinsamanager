import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 빌드에 내장되는 기본 Supabase 자격
const supabaseUrl = 'https://vkubhjkwllpqecgbcubl.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrdWJoamt3bGxwcWVjZ2JjdWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMzYxNjQsImV4cCI6MjA3OTgxMjE2NH0.e0TrKw3ByyXv-rNGspKUcMVb42ZRFxRGBhuEgrC97xI';

const isValidUrl = !!supabaseUrl && /^https?:\/\//i.test(supabaseUrl);
const isValidKey = !!supabaseAnonKey;

export const supabase: SupabaseClient | null =
  isValidUrl && isValidKey ? createClient(supabaseUrl!, supabaseAnonKey!) : null;

export const isSupabaseConfigured = Boolean(supabase);
