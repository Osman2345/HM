const { createAdminClient } = require('../lib/vercel-supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawLimit = req.query?.limit;
  if (Array.isArray(rawLimit)) {
    return res.status(400).json({ error: 'limit must be an integer between 1 and 100' });
  }
  const limit = rawLimit === undefined ? 30 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'limit must be an integer between 1 and 100' });
  }

  try {
    const { data, error } = await createAdminClient()
      .from('hotels')
      .select('id, name, description, location, city, country, rating, review_count, featured, cover_image, images, amenities, policies, rooms')
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return res.status(200).json({ hotels: data ?? [] });
  } catch (error) {
    console.error('Unable to fetch approved hotels:', error);
    return res.status(503).json({ error: 'Hotel service is temporarily unavailable' });
  }
};
