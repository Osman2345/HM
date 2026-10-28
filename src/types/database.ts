export type UserRole = 'user' | 'vendor' | 'admin';
export type VendorStatus = 'pending' | 'approved' | 'rejected';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type HotelApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface HotelRoom {
  id: string;
  type: string;
  price_per_night: number;
  capacity_guests: number;
  total_rooms: number;
  amenities: string[];
  images: string[];
}

export interface HotelRow {
  id: string;
  owner_id: string | null;
  name: string;
  description: string | null;
  price_per_night: number;
  location: string;
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  rating: number;
  review_count: number;
  amenities: string[];
  featured: boolean;
  approval_status: HotelApprovalStatus;
  rejection_reason: string | null;
  cover_image: string | null;
  policies: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  images: string[];
  rooms: HotelRoom[];
  commission_rate: number;
  vendor_terms_accepted_at: string | null;
  vendor_terms_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingRow {
  id: string;
  user_id: string | null;
  hotel_id: string | null;
  room_type: string | null;
  check_in: string;
  check_out: string;
  guests: number;
  rooms: number;
  total_price: number;
  payment_status: PaymentStatus;
  booking_status: BookingStatus;
  vendor_terms_accepted_at: string | null;
  vendor_terms_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  booking_id: string | null;
  title: string;
  message: string;
  read: boolean;
  vendor_terms_accepted_at: string | null;
  vendor_terms_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface FavoriteRow {
  id: string;
  user_id: string;
  hotel_id: string;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  user_id: string;
  hotel_id: string;
  rating: number;
  review: string;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  booking_id: string | null;
  amount: number;
  status: PaymentStatus;
  payment_method: string;
  provider_reference: string | null;
  provider_session_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutRow {
  id: string;
  hotel_id: string | null;
  booking_id: string | null;
  amount: number;
  commission: number;
  hotel_share: number;
  status: string;
  method: Record<string, unknown> | null;
  simulated: boolean;
  created_at: string;
  updated_at: string;
}

export interface VendorPlanRow {
  id: 'free' | 'pro';
  name: 'FREE' | 'PRO';
  price: number;
  commission_percent: number;
  max_hotels: number;
  features: string[];
}

export interface TransactionRow {
  id: string;
  booking_id: string;
  vendor_id: string;
  hotel_id: string;
  total_amount: number;
  commission_amount: number;
  hotel_payout_amount: number;
  status: string;
  created_at: string;
}

export interface WebhookLogRow {
  id: string;
  event_id: string | null;
  event_name: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface PushTokenRow {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          fullname: string | null;
          email: string;
          phone: string | null;
          profile_image: string | null;
          role: UserRole;
          location: string | null;
          preferences: Record<string, unknown>;
          disabled: boolean;
          vendor_status: VendorStatus;
          plan_id: 'free' | 'pro';
          pending_plan_id: 'free' | 'pro';
          business_name: string | null;
          business_description: string | null;
          business_logo: string | null;
          business_document_url: string | null;
          vendor_terms_accepted_at: string | null;
          vendor_terms_version: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          fullname: string | null;
          email: string;
          phone: string | null;
          profile_image: string | null;
          role: UserRole;
          location: string | null;
          preferences: Record<string, unknown>;
          disabled: boolean;
          vendor_status: VendorStatus;
          plan_id: 'free' | 'pro';
          pending_plan_id: 'free' | 'pro';
          business_name: string | null;
          business_description: string | null;
          business_logo: string | null;
          business_document_url: string | null;
          vendor_terms_accepted_at: string | null;
          vendor_terms_version: string | null;
        }>;
        Update: Partial<{
          fullname: string | null;
          phone: string | null;
          profile_image: string | null;
          role: UserRole;
          location: string | null;
          preferences: Record<string, unknown>;
          disabled: boolean;
          vendor_status: VendorStatus;
          plan_id: 'free' | 'pro';
          pending_plan_id: 'free' | 'pro';
          business_name: string | null;
          business_description: string | null;
          business_logo: string | null;
          business_document_url: string | null;
          vendor_terms_accepted_at: string | null;
          vendor_terms_version: string | null;
        }>;
      };
      hotels: {
        Row: HotelRow;
        Insert: Partial<HotelRow>;
        Update: Partial<HotelRow>;
      };
      bookings: {
        Row: BookingRow;
        Insert: Partial<BookingRow>;
        Update: Partial<BookingRow>;
      };
      favorites: {
        Row: FavoriteRow;
        Insert: Partial<FavoriteRow>;
        Update: Partial<FavoriteRow>;
      };
      reviews: {
        Row: ReviewRow;
        Insert: Partial<ReviewRow>;
        Update: Partial<ReviewRow>;
      };
      notifications: {
        Row: NotificationRow;
        Insert: Partial<NotificationRow>;
        Update: Partial<NotificationRow>;
      };
      payments: {
        Row: PaymentRow;
        Insert: Partial<PaymentRow>;
        Update: Partial<PaymentRow>;
      };
      payouts: {
        Row: PayoutRow;
        Insert: Partial<PayoutRow>;
        Update: Partial<PayoutRow>;
      };
      vendor_documents: {
        Row: {
          id: string;
          vendor_id: string;
          document_type: 'national_id' | 'hotel_document' | 'business_document';
          file_url: string;
          status: 'pending' | 'approved' | 'rejected';
          created_at: string;
        };
        Insert: Partial<{
          id: string;
          vendor_id: string;
          document_type: 'national_id' | 'hotel_document' | 'business_document';
          file_url: string;
          status: 'pending' | 'approved' | 'rejected';
          created_at: string;
        }>;
        Update: Partial<{
          document_type: 'national_id' | 'hotel_document' | 'business_document';
          file_url: string;
          status: 'pending' | 'approved' | 'rejected';
        }>;
      };
      vendor_plans: {
        Row: VendorPlanRow;
        Insert: Partial<VendorPlanRow>;
        Update: Partial<VendorPlanRow>;
      };
      vendor_plan_payments: {
        Row: {
          id: string;
          vendor_id: string;
          plan_id: 'free' | 'pro';
          amount: number;
          status: 'pending' | 'paid' | 'failed';
          provider_reference: string;
          provider_session_id: string | null;
          checkout_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          vendor_id: string;
          plan_id: 'free' | 'pro';
          amount: number;
          status: 'pending' | 'paid' | 'failed';
          provider_reference: string;
          provider_session_id: string | null;
          checkout_url: string | null;
        }>;
        Update: Partial<{
          status: 'pending' | 'paid' | 'failed';
          provider_reference: string;
          provider_session_id: string | null;
          checkout_url: string | null;
        }>;
      };
      transactions: {
        Row: TransactionRow;
        Insert: Partial<TransactionRow>;
        Update: Partial<TransactionRow>;
      };
      webhook_logs: {
        Row: WebhookLogRow;
        Insert: Partial<WebhookLogRow>;
        Update: Partial<WebhookLogRow>;
      };
      push_tokens: {
        Row: PushTokenRow;
        Insert: Partial<PushTokenRow>;
        Update: Partial<PushTokenRow>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_room_availability: {
        Args: {
          p_hotel_id: string;
          p_check_in: string;
          p_check_out: string;
        };
        Returns: {
          room_type: string;
          total_rooms: number;
          reserved_rooms: number;
          available_rooms: number;
        }[];
      };
      save_vendor_document: {
        Args: {
          p_document_type: 'national_id' | 'hotel_document' | 'business_document';
          p_file_url: string;
        };
        Returns: {
          id: string;
          vendor_id: string;
          document_type: 'national_id' | 'hotel_document' | 'business_document';
          file_url: string;
          status: 'pending' | 'approved' | 'rejected';
          created_at: string;
        };
      };
      create_booking: {
        Args: {
          p_hotel_id: string;
          p_room_type: string;
          p_check_in: string;
          p_check_out: string;
          p_guests: number;
          p_rooms: number;
        };
        Returns: BookingRow;
      };
      set_booking_status: {
        Args: {
          p_booking_id: string;
          p_status: BookingStatus;
        };
        Returns: BookingRow;
      };
      cancel_guest_booking: {
        Args: {
          p_booking_id: string;
        };
        Returns: BookingRow;
      };
      get_my_saved_hotels: {
        Args: Record<string, never>;
        Returns: {
          favorite_id: string;
          hotel_id: string;
          name: string;
          city: string;
          country: string;
          location: string;
          rating: number;
          cover_image: string | null;
          images: string[];
          rooms: HotelRoom[];
        }[];
      };
      search_hotels: {
        Args: {
          p_query?: string;
          p_city?: string | null;
          p_min_price?: number;
          p_max_price?: number | null;
          p_amenities?: string[] | null;
          p_min_rating?: number;
          p_check_in?: string | null;
          p_check_out?: string | null;
          p_guests?: number;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: (HotelRow & {
          distance_km: number;
          total_price: number;
          available_rooms: number;
        })[];
      };
      nearby_hotels: {
        Args: {
          p_lat: number;
          p_lng: number;
          p_radius_km?: number;
          p_limit?: number;
        };
        Returns: {
          id: string;
          name: string;
          city: string;
          latitude: number;
          longitude: number;
          distance_km: number;
          rating: number;
          cover_image: string | null;
          approval_status: HotelApprovalStatus;
        }[];
      };
      admin_review_hotel: {
        Args: {
          p_hotel_id: string;
          p_status?: string | null;
          p_rejection_reason?: string | null;
          p_featured?: boolean | null;
        };
        Returns: HotelRow;
      };
      admin_update_user: {
        Args: {
          p_user_id: string;
          p_role?: UserRole | null;
          p_disabled?: boolean | null;
          p_vendor_status?: string | null;
        };
        Returns: Database['public']['Tables']['users']['Row'];
      };
    };
    Enums: {
      booking_status: BookingStatus;
      payment_status: PaymentStatus;
      user_role: UserRole;
    };
  };
}
