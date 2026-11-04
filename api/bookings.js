const { createAdminClient, getUserFromAccessToken } = require('../lib/vercel-supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorization = req.headers.authorization;
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) {
    return res.status(401).json({ error: 'A valid Bearer token is required' });
  }

  try {
    const user = await getUserFromAccessToken(accessToken);
    if (!user?.id) {
      return res.status(401).json({ error: 'A valid Bearer token is required' });
    }

    const { data, error } = await createAdminClient()
      .from('bookings')
      .select('id, hotel_id, booking_status, payment_status, payment_method, voucher_code, total_price, check_in, check_out, created_at, hotels(name, city)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    return res.status(200).json({ bookings: data ?? [] });
  } catch (error) {
    console.error('Unable to fetch user bookings:', error);
    return res.status(503).json({ error: 'Booking service is temporarily unavailable' });
  }
};
