import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useGeolocation } from '../hooks/useGeolocation';
import { StarRating } from '../components/StarRating';

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address;
    if (!a) return null;
    // Build a readable address: road + house_number, city
    const parts: string[] = [];
    const road = a.road || a.pedestrian || a.street || '';
    if (road) {
      parts.push(a.house_number ? `${road} ${a.house_number}` : road);
    }
    const city = a.city || a.town || a.village || '';
    if (city) parts.push(city);
    return parts.length > 0 ? parts.join(', ') : null;
  } catch {
    return null;
  }
}

export function NewRatingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const geo = useGeolocation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [stars, setStars] = useState(0);
  const [placeName, setPlaceName] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [drinkName, setDrinkName] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [address, setAddress] = useState('');
  const [addressFromUser, setAddressFromUser] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Reverse geocode when GPS coordinates are available and address not manually set
  const effectiveLat = lat ?? geo.lat;
  const effectiveLng = lng ?? geo.lng;

  useEffect(() => {
    if (!effectiveLat || !effectiveLng || addressFromUser) return;
    let cancelled = false;
    // Start async geocoding — loading state is set in the microtask to avoid synchronous setState in effect
    Promise.resolve().then(() => {
      if (!cancelled) setAddressLoading(true);
    });
    reverseGeocode(effectiveLat, effectiveLng).then((result) => {
      if (cancelled) return;
      setAddressLoading(false);
      if (result) setAddress(result);
    });
    return () => { cancelled = true; };
  }, [effectiveLat, effectiveLng, addressFromUser]);

  // Fetch previously visited places for autocomplete
  const { data: placesData } = useQuery({
    queryKey: ['userPlaces', user?.userId],
    queryFn: () => api.getUserPlaces(user!.userId),
    enabled: !!user,
  });

  const suggestions = useMemo(() => {
    if (!placeName.trim() || !placesData?.places) return [];
    const query = placeName.toLowerCase();
    return placesData.places.filter((p) =>
      p.placeName.toLowerCase().includes(query)
    );
  }, [placeName, placesData]);

  const mutation = useMutation({
    mutationFn: async () => {
      let photoKey: string | undefined;
      if (photo) {
        photoKey = await api.uploadPhoto(photo);
      }

      const finalLat = lat ?? geo.lat ?? 0;
      const finalLng = lng ?? geo.lng ?? 0;
      const finalPlaceId = placeId ?? `place_${placeName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

      return api.createRating({
        placeId: finalPlaceId,
        placeName,
        stars,
        drinkName,
        description: description || undefined,
        photoKey,
        lat: finalLat,
        lng: finalLng,
        address: address.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['userRatings', user?.userId] }),
        queryClient.invalidateQueries({ queryKey: ['userRatingsCount', user?.userId] }),
        queryClient.invalidateQueries({ queryKey: ['userPlaces', user?.userId] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
        queryClient.invalidateQueries({ queryKey: ['placeRatings'] }),
        queryClient.invalidateQueries({ queryKey: ['place'] }),
      ]);
      navigate('/');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create rating');
    },
  });

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stars === 0) { setError('Please select a star rating'); return; }
    if (!placeName.trim()) { setError('Please enter a place name'); return; }
    if (!drinkName.trim()) { setError('Please enter a drink name'); return; }
    setError('');
    mutation.mutate();
  };

  return (
    <div className="p-4 pb-20">
      <h1 className="text-xl font-bold text-stone-800 mb-6">Rate Your Coffee</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Photo */}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            className="hidden"
          />
          {photoPreview ? (
            <div className="relative">
              <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
              <button
                type="button"
                onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                className="absolute top-2 right-2 bg-black/50 text-white w-8 h-8 rounded-full flex items-center justify-center"
              >
                &times;
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full h-36 border-2 border-dashed border-stone-300 rounded-xl flex flex-col items-center justify-center text-stone-400 hover:border-amber-500 hover:text-amber-600 transition-colors"
            >
              <svg className="w-10 h-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
              <span className="text-sm">Add Photo</span>
            </button>
          )}
        </div>

        {/* Star Rating */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">Rating</label>
          <StarRating value={stars} onChange={setStars} size="lg" />
        </div>

        {/* Place Name */}
        <div className="relative">
          <label className="block text-sm font-medium text-stone-700 mb-1">Place Name</label>
          <input
            type="text"
            value={placeName}
            onChange={(e) => {
              setPlaceName(e.target.value);
              setPlaceId(null);
              setAddress('');
              setAddressFromUser(false);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            placeholder="e.g. Caffe Nero"
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {suggestions.map((p) => (
                <li key={p.placeId}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setPlaceName(p.placeName);
                      setPlaceId(p.placeId);
                      setLat(p.lat);
                      setLng(p.lng);
                      setAddress(p.address || '');
                      setAddressFromUser(!!p.address);
                      setShowSuggestions(false);
                    }}
                  >
                    <span className="font-medium text-stone-800">{p.placeName}</span>
                    {p.address && (
                      <span className="block text-xs text-stone-400 mt-0.5">{p.address}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Address</label>
          <div className="relative">
            <input
              type="text"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setAddressFromUser(true); }}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              placeholder="e.g. Gedimino pr. 9, Vilnius"
              autoComplete="off"
            />
            {addressLoading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400">Detecting...</span>
            )}
          </div>
        </div>

        {/* Drink Name */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Drink Name</label>
          <input
            type="text"
            value={drinkName}
            onChange={(e) => setDrinkName(e.target.value)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            placeholder="e.g. flat white, espresso, cappuccino"
            autoComplete="off"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Location</label>
          {geo.lat && geo.lng ? (
            <div className="flex items-center gap-2 text-sm text-stone-600 bg-green-50 px-3 py-2 rounded-lg">
              <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.06l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              <span>Location detected ({geo.lat.toFixed(4)}, {geo.lng.toFixed(4)})</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={geo.getLocation}
              disabled={geo.loading}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm text-stone-600 hover:bg-stone-50 transition-colors text-left"
            >
              {geo.loading ? 'Detecting location...' : 'Tap to detect GPS location'}
            </button>
          )}
          {geo.error && <p className="text-red-500 text-xs mt-1">{geo.error}</p>}

          {/* Manual lat/lng override */}
          <div className="flex gap-2 mt-2">
            <input
              type="number"
              step="any"
              value={lat ?? geo.lat ?? ''}
              onChange={(e) => setLat(parseFloat(e.target.value) || null)}
              className="flex-1 px-3 py-1.5 border border-stone-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Latitude"
            />
            <input
              type="number"
              step="any"
              value={lng ?? geo.lng ?? ''}
              onChange={(e) => setLng(parseFloat(e.target.value) || null)}
              className="flex-1 px-3 py-1.5 border border-stone-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Longitude"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
            placeholder="How was your coffee?"
          />
          <span className="text-xs text-stone-400">{description.length}/500</span>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-amber-700 text-white py-3 rounded-lg font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? 'Saving...' : 'Save Rating'}
        </button>
      </form>
    </div>
  );
}
