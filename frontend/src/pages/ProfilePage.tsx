import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function ProfilePage() {
  const { user, logout } = useAuth();
  const [copied, setCopied] = useState(false);

  const { data: ratingsData } = useQuery({
    queryKey: ['userRatings', user?.userId],
    queryFn: () => api.getUserRatings(user!.userId),
    enabled: !!user,
  });

  const { data: placesData } = useQuery({
    queryKey: ['userPlaces', user?.userId],
    queryFn: () => api.getUserPlaces(user!.userId),
    enabled: !!user,
  });

  const { data: friendsData } = useQuery({
    queryKey: ['friends', user?.userId],
    queryFn: () => api.getFriends(user!.userId),
    enabled: !!user,
  });

  const shareUrl = `${window.location.origin}/u/${user?.username}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-4 pb-20">
      {/* Profile Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-2xl">
            {user?.displayName?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-800">{user?.displayName}</h1>
            <p className="text-stone-500">@{user?.username}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-around mt-6 pt-4 border-t border-stone-100">
          <div className="text-center">
            <p className="text-lg font-bold text-stone-800">{ratingsData?.ratings?.length ?? '-'}</p>
            <p className="text-xs text-stone-500">Coffees</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-stone-800">{placesData?.places?.length ?? '-'}</p>
            <p className="text-xs text-stone-500">Places</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-stone-800">{friendsData?.friends?.length ?? '-'}</p>
            <p className="text-xs text-stone-500">Friends</p>
          </div>
        </div>
      </div>

      {/* Share Link */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-stone-100 mb-4">
        <h3 className="font-semibold text-stone-800 mb-2">Share your profile</h3>
        <div className="flex gap-2">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-sm text-stone-600"
          />
          <button
            onClick={handleCopyLink}
            className="px-4 py-2 bg-amber-700 text-white rounded-lg text-sm font-medium hover:bg-amber-800 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="space-y-2 mb-6">
        <Link
          to="/my-ratings"
          className="block bg-white rounded-xl p-4 shadow-sm border border-stone-100 hover:shadow-md transition-shadow font-medium text-stone-800"
        >
          My Coffees
        </Link>
        <Link
          to="/friends"
          className="block bg-white rounded-xl p-4 shadow-sm border border-stone-100 hover:shadow-md transition-shadow font-medium text-stone-800"
        >
          Friends
        </Link>
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="w-full py-3 text-red-600 font-medium border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
