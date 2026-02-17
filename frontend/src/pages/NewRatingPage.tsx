import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useGeolocation } from '../hooks/useGeolocation';
import { StarRating } from '../components/StarRating';
import { resolveCaffeineMg } from '../lib/caffeine';
import { resizeImage } from '../lib/resizeImage';

async function forwardGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
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
  const [caffeineMg, setCaffeineMg] = useState(0);
  const [caffeineSource, setCaffeineSource] = useState<'static' | 'ai'>('static');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Location override state
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [fallbackAddress, setFallbackAddress] = useState('');
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');

  const effectiveLat = lat ?? geo.lat;
  const effectiveLng = lng ?? geo.lng;
  const hasCoordinates = effectiveLat !== null && effectiveLng !== null;

  // Auto-detect GPS on mount
  useEffect(() => {
    geo.getLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve caffeine from static list with debounce (~300ms after user stops typing)
  useEffect(() => {
    if (!drinkName.trim()) {
      setCaffeineMg(0);
      setCaffeineSource('static');
      return;
    }
    const timer = setTimeout(() => {
      setCaffeineMg(resolveCaffeineMg(drinkName));
      setCaffeineSource('static');
    }, 300);
    return () => clearTimeout(timer);
  }, [drinkName]);

  const handleAskAi = useCallback(async () => {
    if (!drinkName.trim() || isAiLoading) return;
    setIsAiLoading(true);
    try {
      const result = await api.resolveCaffeineAi(drinkName.trim());
      if (result.source === 'ai') {
        setCaffeineMg(result.caffeineMg);
        setCaffeineSource('ai');
      }
    } catch {
      // Keep existing static value on network failure
    } finally {
      setIsAiLoading(false);
    }
  }, [drinkName, isAiLoading]);

  const handleAddressLookup = useCallback(async () => {
    if (!fallbackAddress.trim() || isGeocodingAddress) return;
    setIsGeocodingAddress(true);
    setGeocodeError('');
    try {
      const result = await forwardGeocode(fallbackAddress.trim());
      if (result) {
        setLat(result.lat);
        setLng(result.lng);
        setIsEditingLocation(false);
        setFallbackAddress('');
      } else {
        setGeocodeError('Could not find coordinates for this address');
      }
    } catch {
      setGeocodeError('Failed to look up address');
    } finally {
      setIsGeocodingAddress(false);
    }
  }, [fallbackAddress, isGeocodingAddress]);

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

      const finalLat = effectiveLat ?? 0;
      const finalLng = effectiveLng ?? 0;
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
        caffeineMg,
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
        queryClient.invalidateQueries({ queryKey: ['caffeineStats'] }),
      ]);
      navigate('/');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create rating');
    },
  });

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const resized = await resizeImage(file);
      setPhoto(resized);
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(resized);
    } catch {
      // Fallback: use original file if resize fails
      setPhoto(file);
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stars === 0) { setError('Please select a star rating'); return; }
    if (!drinkName.trim()) { setError('Please enter a drink name'); return; }
    if (!placeName.trim()) { setError('Please enter a place name'); return; }
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
            onChange={handlePhotoSelect}
            className="hidden"
          />
          {photoPreview ? (
            <div className="relative">
              <img src={photoPreview} alt="Preview" className="w-full max-h-72 object-cover rounded-xl" />
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

        {/* Drink Name */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Drink Name</label>
          <input
            type="text"
            value={drinkName}
            onChange={(e) => setDrinkName(e.target.value)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            placeholder="e.g. flat white, cappuccino, green tea"
            autoComplete="off"
          />
          {drinkName.trim() && (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-stone-400">
                {caffeineMg > 0
                  ? `☕ ${caffeineMg} mg caffeine`
                  : '☕ Unknown drink — 0 mg caffeine'}
                {caffeineSource === 'ai' && ' (AI)'}
              </p>
              <button
                type="button"
                onClick={handleAskAi}
                disabled={isAiLoading}
                className="text-xs px-2 py-0.5 rounded-full border border-amber-500 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
              >
                {isAiLoading ? 'Asking AI...' : 'Ask AI'}
              </button>
            </div>
          )}
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Location</label>
          {hasCoordinates && !isEditingLocation ? (
            <div className="flex items-center justify-between text-sm text-stone-600 bg-green-50 px-3 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.06l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <span>Location detected ({effectiveLat!.toFixed(4)}, {effectiveLng!.toFixed(4)})</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingLocation(true)}
                className="text-xs text-amber-700 hover:text-amber-800 underline shrink-0 ml-2"
              >
                Change
              </button>
            </div>
          ) : geo.loading && !isEditingLocation ? (
            <div className="flex items-center gap-2 text-sm text-stone-500 bg-stone-50 px-3 py-2 rounded-lg">
              <svg className="w-4 h-4 animate-spin text-amber-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Detecting location...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {geo.error && !isEditingLocation && (
                <p className="text-amber-600 text-xs">GPS unavailable. Enter an address to look up coordinates.</p>
              )}
              {isEditingLocation && (
                <p className="text-stone-500 text-xs">Enter an address to set a different location.</p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={fallbackAddress}
                  onChange={(e) => { setFallbackAddress(e.target.value); setGeocodeError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddressLookup(); } }}
                  className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                  placeholder="e.g. Gedimino pr. 9, Vilnius"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={handleAddressLookup}
                  disabled={isGeocodingAddress || !fallbackAddress.trim()}
                  className="px-3 py-2 bg-amber-700 text-white rounded-lg text-sm font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {isGeocodingAddress ? 'Looking up...' : 'Look up'}
                </button>
              </div>
              {geocodeError && <p className="text-red-500 text-xs">{geocodeError}</p>}
              {isEditingLocation && (
                <button
                  type="button"
                  onClick={() => { setIsEditingLocation(false); setFallbackAddress(''); setGeocodeError(''); }}
                  className="text-xs text-stone-500 hover:text-stone-700 underline"
                >
                  Cancel
                </button>
              )}
              {!isEditingLocation && !geo.error && (
                <button
                  type="button"
                  onClick={geo.getLocation}
                  className="text-xs text-amber-700 hover:text-amber-800 underline"
                >
                  Try GPS again
                </button>
              )}
            </div>
          )}
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
                      setShowSuggestions(false);
                    }}
                  >
                    <span className="font-medium text-stone-800">{p.placeName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
