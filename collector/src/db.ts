import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in collector/.env");
  process.exit(1);
}

// The service key bypasses row level security. Keep it on this machine only.
export const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
