const buLocations: Record<string, { lat: number; lng: number }> = {
    "george-sherman-union": { lat: 42.3503, lng: -71.1062 },
    "central-campus": { lat: 42.3505, lng: -71.1054 },
    "warren-towers": { lat: 42.3492, lng: -71.1028 },
    "questrom": { lat: 42.3489, lng: -71.1003 },
    "fitrec": { lat: 42.3513, lng: -71.1045 },
    "bu-beach": { lat: 42.3516, lng: -71.1082 },
  };
  
export async function geocodeLocation(location: string) {
  const normalized = location.toLowerCase().trim();
  if (buLocations[normalized]) {
    return buLocations[normalized];
  }

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!mapboxToken) {
    // If no token, return null (will rely on BU locations only)
    return null;
  }

  const query = `${location}, Boston University, Boston MA`;
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}`
  );
  const data = await response.json();

  if (data.features && data.features.length > 0) {
    const [lng, lat] = data.features[0].center;
    return { lat, lng, label: data.features[0].place_name };
  }

  return null;
}