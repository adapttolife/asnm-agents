export async function geocodeAddress(patch) {
  if (!patch.address || !patch.city || !patch.state) return {};
  const query = new URLSearchParams({
    address: patch.address,
    city: patch.city,
    state: patch.state,
    format: "json",
    benchmark: "Public_AR_Current"
  });
  const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${query}`);
  if (!response.ok) return {};
  const match = (await response.json())?.result?.addressMatches?.[0];
  if (!match?.coordinates) return {};
  return {
    lat: Number(match.coordinates.y),
    lng: Number(match.coordinates.x),
    geo_precision: "address"
  };
}