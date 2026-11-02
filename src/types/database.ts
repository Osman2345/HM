export type UserRole = 'user' | 'vendor' | 'admin';
export type VendorStatus = 'pending' | 'approved' | 'rejected';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'checked_out' | 'no_show';
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
  payment_method: 'monime' | 'pay_at_hotel';
  voucher_code: string | null;
  checked_out_at: string | null;
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
  commission_type: 'percentage' | 'fixed_amount';
  commission_value: number;
  currency: 'SLE';
  vendor_payout_status: 'pending' | 'eligible' | 'paid';
  vendor_paid_at: string | null;
  created_at: string;
}

export interface PlatformSettingsRow {
  id: number;
  commission_type: 'percentage' | 'fixed_amount';
  commission_value: number;
  currency: 'SLE';
  updated_by: string | null;
  updated_at: string;
}

export interface BookingNoShowEventRow {
  id: string;
  booking_id: string;
  guest_id: string;
  vendor_id: string;
  no_show_count: number;
  suspicious: boolean;
  marked_at: string;
}

export type WithdrawalProvider = 'orange_money' | 'afri_money';
export type WithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export interface WithdrawalMethodRow {
  owner_id: string;
  provider: WithdrawalProvider;
  phone_number: string;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalRequestRow {
  id: string;
  requester_id: string;
  requester_role: 'admin' | 'vendor';
  amount: number;
  currency: 'SLE';
  provider: WithdrawalProvider;
  phone_number: string;
  status: WithdrawalStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  requested_at: string;
  reviewed_at: string | null;
  paid_at: string | null;
  updated_at: string;
}

export interface WalletSummaryRow {
  earned_balance: number;
  available_balance: number;
  reserved_withdrawals: number;
  withdrawn_total: number;
  provider: WithdrawalProvider | null;
  phone_number: string | null;
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
          vendor_payment_policy_agreed: boolean;
          vendor_payment_policy_agreed_at: string | null;
          vendor_payment_policy_version: string | null;
          no_show_count: number;
          booking_risk_flagged_at: string | null;
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
          vendor_payment_policy_agreed: boolean;
          vendor_payment_policy_agreed_at: string | null;
          vendor_payment_policy_version: string | null;
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
          vendor_payment_policy_agreed: boolean;
          vendor_payment_policy_agreed_at: string | null;
          vendor_payment_policy_version: string | null;
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
      platform_settings: {
        Row: PlatformSettingsRow;
        Insert: Partial<PlatformSettingsRow>;
        Update: Partial<PlatformSettingsRow>;
      };
      booking_no_show_events: {
        Row: BookingNoShowEventRow;
        Insert: Partial<BookingNoShowEventRow>;
        Update: Partial<BookingNoShowEventRow>;
      };
      withdrawal_methods: {
        Row: WithdrawalMethodRow;
        Insert: Partial<WithdrawalMethodRow>;
        Update: Partial<WithdrawalMethodRow>;
      };
      withdrawal_requests: {
        Row: WithdrawalRequestRow;
        Insert: Partial<WithdrawalRequestRow>;
        Update: Partial<WithdrawalRequestRow>;
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
          p_payment_method?: 'monime' | 'pay_at_hotel';
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
      vendor_update_booking_status: {
        Args: { p_booking_id: string; p_status: string };
        Returns: BookingRow;
      };
      get_vendor_booking_contact: {
        Args: { p_booking_id: string };
        Returns: { guest_name: string; guest_phone: string | null }[];
      };
      admin_financial_overview: {
        Args: Record<string, never>;
        Returns: { total_commission: number; total_vendor_payouts: number }[];
      };
      admin_update_vendor_payout: {
        Args: { p_transaction_id: string; p_status: 'eligible' | 'paid' };
        Returns: TransactionRow;
      };
      save_withdrawal_method: {
        Args: { p_provider: WithdrawalProvider; p_phone_number: string };
        Returns: WithdrawalMethodRow;
      };
      get_my_wallet_summary: {
        Args: Record<string, never>;
        Returns: WalletSummaryRow[];
      };
      request_withdrawal: {
        Args: { p_amount: number };
        Returns: WithdrawalRequestRow;
      };
      admin_review_withdrawal: {
        Args: { p_request_id: string; p_status: 'approved' | 'paid' | 'rejected'; p_admin_note?: string | null };
        Returns: WithdrawalRequestRow;
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
