import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { createBackendAccount, resendBackendSignupOtp } from '@/lib/backend';
import { supabase } from '@/lib/supabase';

export type AppRole = 'user' | 'vendor' | 'admin';

export interface AuthProfile {
  id: string;
  email: string | null;
  fullname: string | null;
  role: AppRole;
  vendor_status: string | null;
  disabled: boolean;
}

interface AuthState {
  session: Session | null;
  profile: AuthProfile | null;
  loading: boolean;
  role: AppRole | null;
  error: string | null;
  initialize: () => Promise<void>;
  refreshProfile: () => Promise<AuthProfile>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role?: AppRole,
    vendorApplication?: { businessName: string; termsVersion: string },
  ) => Promise<{ userId: string; otpLength: number; expiresInSeconds: number }>;
  verifySignUpOtp: (email: string, token: string, type?: 'signup' | 'magiclink') => Promise<void>;
  resendSignUpOtp: (
    email: string,
    userId: string,
  ) => Promise<{
    verificationType: 'signup' | 'magiclink';
    otpLength: number;
    expiresInSeconds: number;
  }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string, redirectTo?: string) => Promise<void>;
  exchangePasswordResetCode: (code: string) => Promise<void>;
  setPasswordRecoverySession: (accessToken: string, refreshToken: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const toProfile = (user: User): AuthProfile => ({
  id: user.id,
  email: user.email ?? null,
  fullname: user.user_metadata?.fullname ?? null,
  role: (user.user_metadata?.role as AppRole | undefined) ?? 'user',
  vendor_status: (user.user_metadata?.vendor_status as string | undefined) ?? null,
  disabled: false,
});

type PublicUserRow = {
  id: string;
  email: string;
  fullname: string | null;
  role: AppRole | string;
  vendor_status: string | null;
  disabled: boolean | null;
};

const fetchProfile = async (userId: string): Promise<AuthProfile | null> => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, fullname, role, vendor_status, disabled')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as PublicUserRow | null;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    fullname: row.fullname,
    role: (row.role as AppRole) ?? 'user',
    vendor_status: row.vendor_status ?? null,
    disabled: Boolean(row.disabled),
  };
};

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,
  role: null,
  error: null,

  initialize: async () => {
    set({ loading: true, error: null });

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        set({
          session,
          profile: profile ?? toProfile(session.user),
          role: profile?.role ?? toProfile(session.user).role,
          loading: false,
          error: null,
        });
      } else {
        set({ session: null, profile: null, role: null, loading: false, error: null });
      }
    } catch (error) {
      set({
        session: null,
        profile: null,
        role: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to restore session',
      });
    }

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event: string, nextSession: Session | null) => {
      if (!nextSession?.user) {
        set({ session: null, profile: null, role: null, loading: false, error: null });
        return;
      }

      const fallbackProfile = toProfile(nextSession.user);
      set({
        session: nextSession,
        profile: fallbackProfile,
        role: fallbackProfile.role,
        loading: false,
        error: null,
      });

      setTimeout(() => {
        void fetchProfile(nextSession.user.id).then((profile) => {
          if (get().session?.user.id !== nextSession.user.id) {
            return;
          }

          const nextProfile = profile ?? fallbackProfile;
          set({
            session: nextSession,
            profile: nextProfile,
            role: nextProfile.role,
            loading: false,
            error: null,
          });
        }).catch((error: unknown) => {
          if (get().session?.user.id !== nextSession.user.id) {
            return;
          }

          set({
            session: nextSession,
            profile: fallbackProfile,
            role: fallbackProfile.role,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to sync profile',
          });
        });
      }, 0);
    });

    void authSubscription.subscription.unsubscribe;
  },

  refreshProfile: async () => {
    const session = get().session;
    if (!session) {
      throw new Error('Sign in again to check your vendor application.');
    }

    const profile = await fetchProfile(session.user.id);
    if (!profile) {
      throw new Error('Your account profile could not be found.');
    }

    set({ profile, role: profile.role, error: null });
    return profile;
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true, error: null });

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }

    set({ loading: false, error: null });
  },

  signUp: async (
    email: string,
    password: string,
    fullName: string,
    role: AppRole = 'user',
    vendorApplication?: { businessName: string; termsVersion: string },
  ) => {
    set({ loading: true, error: null });

    const safeRole = role === 'vendor' ? 'vendor' : 'user';
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const result = await createBackendAccount({
        email: normalizedEmail,
        password,
        fullName,
        role: safeRole,
        ...(safeRole === 'vendor' && vendorApplication
          ? {
              businessName: vendorApplication.businessName,
              termsVersion: vendorApplication.termsVersion,
            }
          : {}),
      });
      set({ loading: false, error: null });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create account';
      set({ loading: false, error: message });
      throw error;
    }
  },

  verifySignUpOtp: async (email: string, token: string, type: 'signup' | 'magiclink' = 'signup') => {
    set({ loading: true, error: null });

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type,
    });

    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }

    if (!data.session?.user) {
      const verificationError = new Error('Email verification did not return a signed-in session. Please try again.');
      set({ loading: false, error: verificationError.message });
      throw verificationError;
    }

    const profile = toProfile(data.session.user);
    set({
      session: data.session,
      profile,
      role: profile.role,
      loading: false,
      error: null,
    });
  },

  resendSignUpOtp: async (email: string, userId: string) => {
    set({ loading: true, error: null });

    try {
      const result = await resendBackendSignupOtp(email.trim().toLowerCase(), userId);
      set({ loading: false, error: null });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to resend the verification code';
      set({ loading: false, error: message });
      throw error;
    }
  },

  signOut: async () => {
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }

    set({ session: null, profile: null, role: null, loading: false, error: null });
  },

  resetPassword: async (email: string, redirectTo?: string) => {
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        ...(redirectTo ? { redirectTo } : {}),
      });

      if (error) {
        throw error;
      }

      set({ loading: false, error: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to send a password reset email',
      });
      throw error;
    }
  },

  exchangePasswordResetCode: async (code: string) => {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      throw error;
    }
  },

  setPasswordRecoverySession: async (accessToken: string, refreshToken: string) => {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw error;
    }
  },

  updatePassword: async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      throw error;
    }
  },
}));

export const authActions = useAuthStore.getState();
