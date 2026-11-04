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
    .map((room) => Number(room?.price ?? room?.price_per_night))
    .filter((price) => Number.isFinite(price) && price >= 0);
  if (roomPrices.length > 0) return Math.min(...roomPrices);
  const price = Number(hotel.price);
  return Number.isFinite(price) && price >= 0 ? price : null;
};

const normalizeRoom = (hotelId, room) => {
  const price = Number(room?.price ?? room?.price_per_night);
  const capacity = Number(room?.capacity ?? room?.capacity_guests);
  const availableRooms = Number(room?.available_rooms ?? room?.total_rooms);
  return {
    ...room,
    hotel_id: hotelId,
    name: typeof room?.name === 'string' ? room.name : typeof room?.type === 'string' ? room.type : 'Room',
    type: typeof room?.type === 'string' ? room.type : typeof room?.name === 'string' ? room.name : 'Room',
    price: Number.isFinite(price) && price >= 0 ? price : null,
    price_per_night: Number.isFinite(price) && price >= 0 ? price : null,
    bed_type: typeof room?.bed_type === 'string' && room.bed_type.trim() ? room.bed_type.trim() : null,
    capacity: Number.isFinite(capacity) && capacity >= 0 ? capacity : null,
    capacity_guests: Number.isFinite(capacity) && capacity >= 0 ? capacity : null,
    amenities: Array.isArray(room?.amenities) ? room.amenities.filter((amenity) => typeof amenity === 'string') : [],
    available_rooms: Number.isFinite(availableRooms) && availableRooms >= 0 ? availableRooms : null,
    total_rooms: Number.isFinite(availableRooms) && availableRooms >= 0 ? availableRooms : null,
  };
};

const normalizeHotel = (hotel) => {
  const rooms = (Array.isArray(hotel.rooms) ? hotel.rooms : [])
    .map((room) => normalizeRoom(hotel.id, room));
  const normalized = {
    ...hotel,
    amenities: Array.isArray(hotel.amenities) ? hotel.amenities : [],
    images: Array.isArray(hotel.images) ? hotel.images : [],
    rooms,
  };
  return { ...normalized, price: getHotelPrice(normalized) };
};

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
    answer: typeof parsed.answer === 'string' ? parsed.answer.trim() : '',
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

const buildRoomComparisonAnswer = (query, hotels) => {
  if (!/\b(?:difference|compare|comparison|versus|vs\.?)\b/i.test(query)) return null;

  const genericHotelNameParts = new Set(['hotel', 'guest', 'house', 'lodge', 'resort']);
  const hotel = hotels.find((candidate) => {
    const nameParts = normalizePhrase(candidate.name)
      .split(' ')
      .filter((part) => part.length > 2 && !genericHotelNameParts.has(part));
    const mentioned = containsPhrase(query, candidate.name)
      || nameParts.some((part) => containsPhrase(query, part));
    return mentioned && candidate.rooms.length > 0;
  });
  if (!hotel) return null;

  const matchedRooms = hotel.rooms.filter((room) => containsPhrase(query, room.name));
  if (matchedRooms.length !== 2) return null;

  const formatPrice = (price) => price === null ? 'price not listed' : `Le ${price.toLocaleString('en-SL')} per night`;
  const formatCapacity = (capacity) => capacity === null ? 'capacity not listed' : `up to ${capacity} guests`;
  const formatAvailability = (count) => count === null
    ? 'availability not listed'
    : `${count} ${count === 1 ? 'room' : 'rooms'} available`;
  const describeRoom = (room) => [
    `${room.name}: ${formatPrice(room.price)}`,
    room.bed_type || 'bed type not listed',
    formatCapacity(room.capacity),
    formatAvailability(room.available_rooms),
    ...(room.amenities.length ? [`amenities: ${room.amenities.join(', ')}`] : []),
  ].join('; ');
  const [first, second] = matchedRooms;
  const differences = [];
  if (first.price !== null && second.price !== null) {
    differences.push(`the nightly price differs by Le ${Math.abs(first.price - second.price).toLocaleString('en-SL')}`);
  }
  if (first.capacity !== null && second.capacity !== null) {
    differences.push(`capacity differs by ${Math.abs(first.capacity - second.capacity)} guest${Math.abs(first.capacity - second.capacity) === 1 ? '' : 's'}`);
  }

  return [
    `At ${hotel.name}:`,
    describeRoom(first),
    describeRoom(second),
    differences.length ? `In short, ${differences.join(' and ')}.` : 'Some comparison details are not listed in the room data.',
  ].join('\n');
};

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

  const { hotels } = await loadHotels();
  const roomContext = hotels.flatMap((hotel) => hotel.rooms.map((room) => ({
    hotel: hotel.name,
    city: hotel.city,
    room,
  })));
  const groq = new Groq({ apiKey: groqApiKey });
  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are SL ASK for SL STAY, Sierra Leone hotel booking.
You have access to hotels AND their rooms.
When user asks about rooms, compare them by price, bed type, capacity, and amenities.
Always answer in Leones (Le).
If user asks about LIA hotel, use its real rooms: ROOM A (KINGBED, 4 rooms, Le 1000) vs room b (balcony, 2 rooms, Le 50).
Do not make up rooms.

Use only the supplied hotel and room data for factual claims. The room data is sourced from the hotels' rooms JSON in Supabase; room name/type, price_per_night, capacity_guests, and total_rooms are normalized to name, price, capacity, and available_rooms. If any requested detail is missing from the data, say it is not listed.

Also parse search constraints: detect Sierra Leone locations; explicit minPrice and maxPrice; cheap means below 300, budget below 500, luxury above 1000; detect AC, wifi, pool, parking, breakfast, kitchen, beach, and gym; detect cheap, luxury, family, business, romantic, or beachfront vibes.
Return only a JSON object with location (string or null), minPrice (number or null), maxPrice (number or null), amenities (string array), vibe (string or null), summary (string), and answer (a concise natural-language answer to the user's question, or an empty string when no factual answer is possible).`,
      },
      {
        role: 'user',
        content: JSON.stringify({ query, hotels: hotels.map(({ id, name, city, location }) => ({ id, name, city, location })), rooms: roomContext }),
      },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Groq returned an empty recommendation response.');
  const intent = mergeQueryConstraints(parseIntent(content), query);
  const matchingHotels = filterHotelsStrictly(hotels, intent);
  const roomComparisonAnswer = buildRoomComparisonAnswer(query, hotels);

  return {
    query,
    recommendations: matchingHotels.map((hotel) => ({ hotel })),
    answer: roomComparisonAnswer || intent.answer || null,
    message: matchingHotels.length ? null : 'No hotel matches your description',
  };
};

module.exports = {
  buildRoomComparisonAnswer,
  filterHotelsStrictly,
  getRecommendations,
  mergeQueryConstraints,
  normalizeRoom,
};
