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
    const { data, error } = await createAdminClient().rpc('search_hotels', {
      p_limit: limit,
      p_offset: 0,
      p_sort: 'featured',
    });
    if (error) throw error;

    const hotels = (data ?? []).map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      description: hotel.description,
      location: hotel.location,
      city: hotel.city,
      country: hotel.country,
      rating: hotel.rating,
      review_count: hotel.review_count,
      featured: hotel.featured,
      cover_image: hotel.cover_image,
      images: hotel.images,
      amenities: hotel.amenities,
      policies: hotel.policies,
      rooms: hotel.rooms,
    }));

    return res.status(200).json({ hotels });
  } catch (error) {
    console.error('Unable to fetch approved hotels:', error);
    return res.status(503).json({ error: 'Hotel service is temporarily unavailable' });
  }
};
