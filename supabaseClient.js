// OPSIONAL: hanya untuk jalan lokal. Di Railway isi variabel SUPABASE_URL & SUPABASE_ANON_KEY (file ini tidak perlu diisi).
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

// Pustaka Supabase dimuat dari index.html (window.supabase)
if (!window.supabase) throw new Error('Pustaka Supabase gagal dimuat dari cdn.jsdelivr.net (cek internet/adblock).');

export const configured = !SUPABASE_URL.includes('YOUR-') && !SUPABASE_ANON_KEY.includes('YOUR-');
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
