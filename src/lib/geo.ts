export const defaultRegion = {
  latitude: 8.48,
  longitude: -13.23,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
} as const;

export const getDistanceKm = (latA: number, lonA: number, latB: number, lonB: number): number => {
  const earthRadiusKm = 6371;
  const dLat = ((latB - latA) * Math.PI) / 180;
  const dLon = ((lonB - lonA) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((latA * Math.PI) / 180) *
      Math.cos((latB * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return Number((2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
};
