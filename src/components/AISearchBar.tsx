import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { buildBackendUrl } from '@/lib/backend';

export type AIHotelResult = {
  id: string;
  name: string;
  city?: string | null;
  location?: string | null;
  country?: string | null;
  rating?: number | null;
  review_count?: number | null;
  featured?: boolean | null;
  description?: string | null;
  cover_image?: string | null;
  images?: string[] | null;
  amenities?: string[] | null;
  policies?: string | null;
  rooms?: {
    type?: string | null;
    price_per_night?: number | string | null;
    total_rooms?: number | null;
    capacity_guests?: number | null;
  }[] | null;
};

export type AISearchState = {
  loading: boolean;
  results: AIHotelResult[];
  error?: boolean;
};

type RecommendationResponse = {
  recommendations?: { hotel: AIHotelResult }[];
  answer?: string | null;
  message?: string | null;
  error?: string;
};

const requestJson = async (url: string, init: RequestInit) => {
  const response = await fetch(url, init);
  const payload = await response.json() as RecommendationResponse;
  if (!response.ok) {
    throw new Error(payload.error || 'AI search is temporarily unavailable.');
  }
  return payload;
};

export default function AISearchBar({
  onSearchStateChange,
}: {
  onSearchStateChange: (state: AISearchState) => void;
}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const askAI = async () => {
    if (!query.trim() || loading) return;

    setLoading(true);
    setMessage(null);
    onSearchStateChange({ loading: true, results: [] });
    try {
      const response = await requestJson(buildBackendUrl('/api/ai/recommend'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      onSearchStateChange({
        loading: false,
        results: (response.recommendations ?? []).map(({ hotel }) => hotel),
      });
      setMessage(response.answer || response.message || null);
    } catch (error) {
      onSearchStateChange({ loading: false, results: [], error: true });
      setMessage(error instanceof Error && (
        error.message === 'AI service not configured'
        || error.message === 'Hotel search database not configured'
      )
        ? error.message
        : 'AI search is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          accessibilityLabel="Ask SL ASK about hotels and rooms"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void askAI()}
          returnKeyType="search"
          placeholder="Ask SL ASK... e.g. compare rooms at LIA"
          placeholderTextColor="#718096"
          style={styles.input}
          maxLength={500}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Ask SL ASK"
          style={[styles.askButton, loading && styles.disabledButton]}
          onPress={() => void askAI()}
          disabled={loading || !query.trim()}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.askButtonText}>Ask SL ASK</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? <Text style={styles.status}>Searching...</Text> : null}
      {!loading && message ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 12, marginBottom: 8, gap: 12 },
  searchBar: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 5,
    borderWidth: 1,
    borderColor: '#D5E0E2',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#132A3A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  input: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 12, color: '#17212C', fontSize: 14 },
  askButton: {
    minWidth: 112,
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#087E8B',
  },
  disabledButton: { opacity: 0.7 },
  askButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  status: { padding: 12, borderRadius: 12, backgroundColor: '#F3F8FA', color: '#17354B', fontSize: 14, lineHeight: 21 },
});
