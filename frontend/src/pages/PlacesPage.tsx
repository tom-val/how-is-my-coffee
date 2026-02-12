import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';


// Fix leaflet default marker icon
const icon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

export function PlacesPage() {
  const { user } = useAuth();
  const [view, setView] = useState<'map' | 'list'>('list');

  const { data, isLoading } = useQuery({
    queryKey: ['userPlaces', user?.userId],
    queryFn: () => api.getUserPlaces(user!.userId),
    enabled: !!user,
  });

  const places = data?.places || [];
  const center: [number, number] = places.length > 0
    ? [places[0].lat, places[0].lng]
    : [54.6872, 25.2797]; // Default: Vilnius

  return (
    <div className="p-4 pb-20">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-stone-800">My Places</h1>
        <div className="flex bg-stone-100 rounded-lg p-0.5">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${view === 'list' ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500'}`}
          >
            List
          </button>
          <button
            onClick={() => setView('map')}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${view === 'map' ? 'bg-white shadow-sm text-stone-800' : 'text-stone-500'}`}
          >
            Map
          </button>
        </div>
      </div>

      {isLoading && <div className="text-center py-12 text-stone-400">Loading...</div>}

      {!isLoading && places.length === 0 && (
        <div className="text-center py-12">
          <p className="text-stone-500">No places visited yet</p>
        </div>
      )}

      {!isLoading && places.length > 0 && view === 'map' && (
        <div className="rounded-xl overflow-hidden border border-stone-200" style={{ height: '60vh' }}>
          <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {places.map((p) => (
              <Marker key={p.placeId} position={[p.lat, p.lng]} icon={icon}>
                <Popup>
                  <Link to={`/places/${p.placeId}`} className="font-semibold text-amber-700">
                    {p.placeName}
                  </Link>
                  <br />
                  <span className="text-xs text-stone-500">{p.visitCount} visit{p.visitCount !== 1 ? 's' : ''}</span>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {!isLoading && places.length > 0 && view === 'list' && (
        <div className="space-y-3">
          {places.map((p) => (
            <Link
              key={p.placeId}
              to={`/places/${p.placeId}`}
              className="block bg-white rounded-xl p-4 shadow-sm border border-stone-100 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-stone-800">{p.placeName}</h3>
                  {p.address && <p className="text-sm text-stone-500 mt-0.5">{p.address}</p>}
                </div>
                <span className="text-xs text-stone-400 whitespace-nowrap ml-2">
                  {p.visitCount} visit{p.visitCount !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-2">
                Last: {new Date(p.lastVisited).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
