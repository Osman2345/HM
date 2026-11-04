const { createClient } = require('@supabase/supabase-js');

const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;

const createAdminClient = () => {
  const url = getSupabaseUrl();
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
  }

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

const getUserFromAccessToken = async (accessToken) => {
  const url = getSupabaseUrl();
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  }

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) return null;
  return data.user;
};

module.exports = { createAdminClient, getUserFromAccessToken };
