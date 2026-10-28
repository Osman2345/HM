import { supabase } from '@/lib/supabase';
import type { BookingStatus, HotelApprovalStatus, HotelRoom, UserRole } from '@/types/database';

export interface AdminUser {
  id: string;
  fullname: string | null;
  email: string;
  role: UserRole;
  vendor_status: string;
  plan_id: 'free' | 'pro';
  pending_plan_id: 'free' | 'pro';
  disabled: boolean;
  business_name: string | null;
  business_description: string | null;
  business_document_url: string | null;
  vendor_terms_accepted_at: string | null;
  vendor_terms_version: string | null;
  created_at: string;
  vendor_documents?: {
    id: string;
    document_type: 'national_id' | 'hotel_document' | 'business_document';
    file_url: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
  }[];
}

export interface AdminHotel {
  id: string;
  owner_id: string | null;
  name: string;
  description: string;
  location: string;
  city: string;
  country: string;
  approval_status: HotelApprovalStatus;
  rejection_reason: string | null;
  featured: boolean;
  rating: number;
  review_count: number;
  cover_image: string | null;
  policies: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  amenities: string[];
  images: string[];
  rooms: HotelRoom[];
  created_at: string;
}

export interface AdminBooking {
  id: string;
  user_id: string | null;
  hotel_id: string | null;
  check_in: string;
  check_out: string;
  guests: number;
  rooms: number;
  total_price: number;
  payment_status: string;
  booking_status: BookingStatus;
  created_at: string;
  users: { fullname: string | null; email: string } | null;
  hotels: { name: string } | null;
}

export interface AdminActivity {
  id: string;
  kind: 'notification' | 'booking';
  title: string;
  detail: string;
  created_at: string;
}

export interface AdminOverview {
  users: number;
  vendors: number;
  approvedVendors: number;
  pendingVendors: number;
  hotels: number;
  pendingHotels: number;
  bookings: number;
  activity: AdminActivity[];
}

export interface AdminReport {
  bookings: AdminBooking[];
  revenue: number;
  commission: number;
  newUsers: number;
  topHotels: { name: string; bookings: number; revenue: number }[];
  periodEnd: string;
}

const throwIfError = <T>(data: T, error: { message: string } | null): T => {
  if (error) {
    throw new Error(error.message);
  }
  return data;
};

const countRows = async (
  table: 'users' | 'hotels' | 'bookings',
  filters: [string, string][] = [],
): Promise<number> => {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  filters.forEach(([column, value]) => {
    query = query.eq(column, value);
  });
  const { count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
};

export const loadAdminOverview = async (): Promise<AdminOverview> => {
  const [users, vendors, approvedVendors, pendingVendors, hotels, pendingHotels, bookings, notifications, recentBookings] =
    await Promise.all([
      countRows('users'),
      countRows('users', [['role', 'vendor']]),
      countRows('users', [['role', 'vendor'], ['vendor_status', 'approved']]),
      countRows('users', [['role', 'vendor'], ['vendor_status', 'pending']]),
      countRows('hotels'),
      countRows('hotels', [['approval_status', 'pending']]),
      countRows('bookings'),
      supabase
        .from('notifications')
        .select('id, title, message, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('bookings')
        .select('id, created_at, booking_status, users(fullname), hotels(name)')
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

  const notificationRows = throwIfError(notifications.data ?? [], notifications.error) as {
    id: string;
    title: string;
    message: string;
    created_at: string;
  }[];
  const bookingRows = throwIfError(recentBookings.data ?? [], recentBookings.error) as {
    id: string;
    created_at: string;
    booking_status: string;
    users: { fullname: string | null } | null;
    hotels: { name: string } | null;
  }[];

  const activity: AdminActivity[] = [
    ...notificationRows.map((row) => ({
      id: `notification-${row.id}`,
      kind: 'notification' as const,
      title: row.title,
      detail: row.message,
      created_at: row.created_at,
    })),
    ...bookingRows.map((row) => ({
      id: `booking-${row.id}`,
      kind: 'booking' as const,
      title: 'Booking activity',
      detail: `${row.users?.fullname ?? 'A guest'} — ${row.hotels?.name ?? 'Hotel'} (${row.booking_status})`,
      created_at: row.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  return { users, vendors, approvedVendors, pendingVendors, hotels, pendingHotels, bookings, activity };
};

export const loadAdminHotels = async (status: HotelApprovalStatus | 'all'): Promise<AdminHotel[]> => {
  let query = supabase
    .from('hotels')
    .select('id, owner_id, name, description, location, city, country, approval_status, rejection_reason, featured, rating, review_count, cover_image, policies, check_in_time, check_out_time, amenities, images, rooms, created_at')
    .order('created_at', { ascending: false });
  if (status !== 'all') {
    query = query.eq('approval_status', status);
  }
  const { data, error } = await query;
  return throwIfError(data ?? [], error) as AdminHotel[];
};

export const reviewAdminHotel = async (
  hotelId: string,
  status: HotelApprovalStatus | null,
  rejectionReason: string | null,
  featured: boolean | null,
): Promise<void> => {
  const { error } = await supabase.rpc('admin_review_hotel', {
    p_hotel_id: hotelId,
    p_status: status,
    p_rejection_reason: rejectionReason,
    p_featured: featured,
  });
  if (error) {
    throw new Error(error.message);
  }
};

export const loadAdminVendors = async (): Promise<AdminUser[]> => {
  const { data, error } = await supabase
    .from('users')
    .select('id, fullname, email, role, vendor_status, plan_id, pending_plan_id, disabled, business_name, business_description, business_document_url, vendor_terms_accepted_at, vendor_terms_version, created_at, vendor_documents(id, document_type, file_url, status, created_at)')
    .eq('role', 'vendor')
    .order('created_at', { ascending: false });
  return throwIfError(data ?? [], error) as AdminUser[];
};

export const loadAdminUsers = async (search: string): Promise<AdminUser[]> => {
  const selectUsers = () =>
    supabase
      .from('users')
      .select('id, fullname, email, role, vendor_status, plan_id, pending_plan_id, disabled, business_name, business_description, business_document_url, vendor_terms_accepted_at, vendor_terms_version, created_at, vendor_documents(id, document_type, file_url, status, created_at)')
      .order('created_at', { ascending: false })
      .limit(100);
  const term = search.trim();
  if (!term) {
    const { data, error } = await selectUsers();
    return throwIfError(data ?? [], error) as AdminUser[];
  }

  const [byEmail, byName] = await Promise.all([
    selectUsers().ilike('email', `%${term}%`),
    selectUsers().ilike('fullname', `%${term}%`),
  ]);
  const emailRows = throwIfError(byEmail.data ?? [], byEmail.error) as AdminUser[];
  const nameRows = throwIfError(byName.data ?? [], byName.error) as AdminUser[];
  return [...new Map([...emailRows, ...nameRows].map((user) => [user.id, user])).values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const updateAdminUser = async (
  userId: string,
  values: { role?: UserRole; disabled?: boolean; vendorStatus?: string },
): Promise<void> => {
  const { error } = await supabase.rpc('admin_update_user', {
    p_user_id: userId,
    p_role: values.role ?? null,
    p_disabled: values.disabled ?? null,
    p_vendor_status: values.vendorStatus ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
};

export const loadAdminBookings = async (status: BookingStatus | 'all'): Promise<AdminBooking[]> => {
  let query = supabase
    .from('bookings')
    .select('id, user_id, hotel_id, check_in, check_out, guests, rooms, total_price, payment_status, booking_status, created_at, users(fullname, email), hotels(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') {
    query = query.eq('booking_status', status);
  }
  const { data, error } = await query;
  return throwIfError(data ?? [], error) as AdminBooking[];
};

export const loadAdminReport = async (periodDays: number): Promise<AdminReport> => {
  const periodEnd = new Date().toISOString();
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
  const [bookings, payouts, users] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, user_id, hotel_id, check_in, check_out, guests, rooms, total_price, payment_status, booking_status, created_at, users(fullname, email), hotels(name)')
      .gte('created_at', since)
      .order('created_at', { ascending: false }),
    supabase.from('payouts').select('amount, commission, created_at').gte('created_at', since),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ]);

  const bookingRows = throwIfError(bookings.data ?? [], bookings.error) as AdminBooking[];
  const payoutRows = throwIfError(payouts.data ?? [], payouts.error) as { amount: number; commission: number }[];
  if (users.error) {
    throw new Error(users.error.message);
  }

  const hotels = new Map<string, { name: string; bookings: number; revenue: number }>();
  bookingRows.forEach((booking) => {
    const name = booking.hotels?.name ?? 'Unknown hotel';
    const hotelKey = booking.hotel_id ?? `deleted-${booking.id}`;
    const aggregate = hotels.get(hotelKey) ?? { name, bookings: 0, revenue: 0 };
    aggregate.bookings += 1;
    if (booking.payment_status === 'paid') {
      aggregate.revenue += Number(booking.total_price);
    }
    hotels.set(hotelKey, aggregate);
  });

  return {
    bookings: bookingRows,
    revenue: payoutRows.reduce((sum, payout) => sum + Number(payout.amount), 0),
    commission: payoutRows.reduce((sum, payout) => sum + Number(payout.commission), 0),
    newUsers: users.count ?? 0,
    topHotels: [...hotels.values()].sort((a, b) => b.bookings - a.bookings).slice(0, 5),
    periodEnd,
  };
};
