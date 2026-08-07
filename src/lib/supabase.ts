import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_URL = 'https://xutjahmbyrvifcltpxxu.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_MdOTKiEJr1RMUuMEY2lJNQ_Lhggiv3M';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const isSupabaseEnabled = supabase !== null;

