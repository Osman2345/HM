const Groq = require('groq-sdk');
const { createClient } = require('@supabase/supabase-js');
const { getAIConfig } = require('./config/ai');

const amenityAliases = {
  ac: ['ac', 'air conditioning', 'air-conditioned'],
  wifi: ['wifi', 'wi-fi', 'wireless internet'],
  pool: ['pool', 'swimming pool'],
  parking: ['parking', 'car park'],
  breakfast: ['breakfast'],
  kitchen: ['kitchen', 'kitchenette'],
  beach: ['beach', 'beachfront', 'beach front'],
  gym: ['gym', 'fitness center', 'fitness centre'],
};

const getHotelPrice = (hotel) => {
  const roomPrices = (Array.isArray(hotel.rooms) ? hotel.rooms : [])
    .map((room) => Number(room?.price_per_night))
    .filter((price) => Number.isFinite(price) && price >= 0);
  if (roomPrices.length > 0) return Math.min(...roomPrices);
  const price = Number(hotel.price);
  return Number.isFinite(price) && price >= 0 ? price : null;
};

const normalizeHotel = (hotel) => ({
  ...hotel,
  price: getHotelPrice(hotel),
  amenities: Array.isArray(hotel.amenities) ? hotel.amenities : [],
  images: Array.isArray(hotel.images) ? hotel.images : [],
  rooms: Array.isArray(hotel.rooms) ? hotel.rooms : [],
});

const normalizePhrase = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const containsPhrase = (value, phrase) => ` ${normalizePhrase(value)} `.includes(` ${normalizePhrase(phrase)} `);

const getFallbackIntent = (query) => {
  const normalized = query.toLowerCase();
  const locations = ['lumley', 'aberdeen', 'freetown', 'bo', 'kenema', 'makeni', 'lungi', 'kono'];
  const location = locations.find((place) => containsPhrase(normalized, place)) || null;
  const rangeMatch = normalized.match(/(?:between|from)\s*(?:le\s*)?([\d,]+)\s*(?:and|to|-)\s*(?:le\s*)?([\d,]+)/i);
  const maxPriceMatch = normalized.match(/(?:under|below|less than|max(?:imum)?(?: price)?(?: of)?|up to|at most|no more than)\s*(?:le\s*)?([\d,]+)/i);
  const minPriceMatch = normalized.match(/(?:above|over|more than|at least|minimum(?: price)?(?: of)?)\s*(?:le\s*)?([\d,]+)/i);
  let minPrice = rangeMatch
    ? Number(rangeMatch[1].replaceAll(',', ''))
    : minPriceMatch
      ? Number(minPriceMatch[1].replaceAll(',', ''))
      : null;
  let maxPrice = rangeMatch
    ? Number(rangeMatch[2].replaceAll(',', ''))
    : maxPriceMatch
      ? Number(maxPriceMatch[1].replaceAll(',', ''))
      : null;
  if (maxPrice === null && /\bcheap\b/.test(normalized)) maxPrice = 299.99;
  if (maxPrice === null && /\bbudget\b/.test(normalized)) maxPrice = 500;
  if (minPrice === null && maxPrice === null && /\bluxury\b/.test(normalized)) minPrice = 1000;
  if (!Number.isFinite(minPrice)) minPrice = null;
  if (!Number.isFinite(maxPrice)) maxPrice = null;
  const amenities = Object.entries(amenityAliases)
    .filter(([, aliases]) => aliases.some((alias) => containsPhrase(normalized, alias)))
    .map(([amenity]) => amenity);
  const vibe = ['cheap', 'luxury', 'family', 'business', 'romantic', 'beachfront']
    .find((candidate) => normalized.includes(candidate)) || null;

  return {
    location,
    minPrice,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : null,
    amenities,
    vibe,
    summary: [
      location ? `near ${location}` : null,
      maxPrice === null ? null : `up to Le ${maxPrice}`,
      amenities.length ? `with ${amenities.join(', ')}` : null,
      vibe ? `${vibe} stay` : null,
    ].filter(Boolean).join(' · ') || 'A stay matching your search',
  };
};

const parseIntent = (value) => {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Groq returned an invalid recommendation intent.');
  }
  const minPrice = parsed.minPrice === null || parsed.minPrice === undefined ? null : Number(parsed.minPrice);
  const maxPrice = parsed.maxPrice === null ? null : Number(parsed.maxPrice);
  const amenities = Array.isArray(parsed.amenities)
    ? parsed.amenities
      .filter((amenity) => typeof amenity === 'string')
      .map((amenity) => amenity.toLowerCase())
      .map((amenity) => Object.entries(amenityAliases)
        .find(([, aliases]) => aliases.some((alias) => amenity.includes(alias)))?.[0] || amenity)
    : [];
  return {
    location: typeof parsed.location === 'string' && parsed.location.trim() ? parsed.location.trim() : null,
    minPrice: Number.isFinite(minPrice) && minPrice >= 0 ? minPrice : null,
    maxPrice: Number.isFinite(maxPrice) && maxPrice >= 0 ? maxPrice : null,
    amenities: [...new Set(amenities)],
    vibe: typeof parsed.vibe === 'string' && parsed.vibe.trim() ? parsed.vibe.trim() : null,
    summary: typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'A stay matching your search',
  };
};

const mergeQueryConstraints = (intent, query) => {
  const queryConstraints = getFallbackIntent(query);
  return {
    ...intent,
    location: queryConstraints.location || intent.location,
    minPrice: queryConstraints.minPrice ?? intent.minPrice,
    maxPrice: queryConstraints.maxPrice ?? intent.maxPrice,
    amenities: [...new Set([...intent.amenities, ...queryConstraints.amenities])],
  };
};

const matchesAmenity = (hotelAmenity, requestedAmenity) => {
  const available = normalizePhrase(hotelAmenity);
  const requested = normalizePhrase(requestedAmenity);
  const aliases = amenityAliases[requested] || [requested];
  return aliases.some((alias) => containsPhrase(available, alias));
};

const filterHotelsStrictly = (hotels, intent) => hotels
  .filter((hotel) => {
    if (intent.location) {
      const locationText = [hotel.location, hotel.city].filter(Boolean).join(' ');
      if (!containsPhrase(locationText, intent.location)) return false;
    }

    if (intent.minPrice !== null || intent.maxPrice !== null) {
      const price = getHotelPrice(hotel);
      if (price === null) return false;
      if (intent.minPrice !== null && price < intent.minPrice) return false;
      if (intent.maxPrice !== null && price > intent.maxPrice) return false;
    }

    return intent.amenities.every((amenity) =>
      hotel.amenities.some((hotelAmenity) => matchesAmenity(hotelAmenity, amenity)));
  })
  .map((hotel) => ({ ...hotel, price: getHotelPrice(hotel) }));

const loadHotels = async () => {
  const hasSupabaseConfig = Boolean(
    process.env.SUPABASE_URL
    && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
  if (!hasSupabaseConfig) {
    const error = new Error('Hotel search database not configured');
    error.code = 'HOTEL_DATABASE_NOT_CONFIGURED';
    throw error;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await supabase
    .from('hotels')
    .select('id, name, description, location, city, country, rating, review_count, featured, price_per_night, cover_image, images, amenities, policies, rooms')
    .eq('approval_status', 'approved')
    .limit(100);
  if (error) throw error;

  return { hotels: (data ?? []).map(normalizeHotel) };
};

const getRecommendations = async (query) => {
  const { groqApiKey, isConfigured, model } = getAIConfig();

  if (!isConfigured) {
    const error = new Error('AI service not configured');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const groq = new Groq({ apiKey: groqApiKey });
  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are SL STAY AI for Sierra Leone hotels. Parse the user query into JSON only.
Locations to detect: Freetown, Lumley, Aberdeen, Bo, Kenema, Makeni, Lungi, Kono, and other Sierra Leone destinations.
Price: extract minPrice and maxPrice from explicit ranges or limits like "between Le 200 and Le 500", "under Le 500", or "above 1000"; cheap means below 300, budget below 500, luxury above 1000.
Amenities: detect AC, wifi, pool, parking, breakfast, kitchen, beach, and gym.
Vibe: detect cheap, luxury, family, business, romantic, or beachfront.
Return only a JSON object with location (string or null), minPrice (number or null), maxPrice (number or null), amenities (string array), vibe (string or null), and summary (string).`,
      },
      { role: 'user', content: query },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned an empty recommendation response.');
  const intent = mergeQueryConstraints(parseIntent(content), query);
  const { hotels } = await loadHotels();
  const matchingHotels = filterHotelsStrictly(hotels, intent);

  return {
    query,
    recommendations: matchingHotels.map((hotel) => ({ hotel })),
    message: matchingHotels.length ? null : 'No hotel matches your description',
  };
};

module.exports = { filterHotelsStrictly, getRecommendations, mergeQueryConstraints };
