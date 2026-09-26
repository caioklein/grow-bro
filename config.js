window.DIARIO_SUPABASE = null;

const SUPABASE_URL = "https://klaktdvanzuooddxlvsb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_A3vUvh_h5dPFS8MC_OdPrg_UMc5f66u";

if (
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_ANON_KEY &&
  window.supabase
) {
  window.DIARIO_SUPABASE = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}
