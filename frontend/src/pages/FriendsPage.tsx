import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function FriendsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [friendUsername, setFriendUsername] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['friends', user?.userId],
    queryFn: () => api.getFriends(user!.userId),
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: (username: string) => api.addFriend(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends', user?.userId] });
      setFriendUsername('');
      setError('');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to add friend');
    },
  });

  const friends = data?.friends || [];

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendUsername.trim()) return;
    addMutation.mutate(friendUsername.trim());
  };

  return (
    <div className="p-4 pb-20">
      <h1 className="text-xl font-bold text-stone-800 mb-6">Friends</h1>

      {/* Add Friend */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          value={friendUsername}
          onChange={(e) => setFriendUsername(e.target.value)}
          className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
          placeholder="Enter username"
        />
        <button
          type="submit"
          disabled={addMutation.isPending}
          className="bg-amber-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors"
        >
          Add
        </button>
      </form>
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* Friend List */}
      {isLoading && <div className="text-center py-8 text-stone-400">Loading...</div>}

      {!isLoading && friends.length === 0 && (
        <div className="text-center py-8">
          <p className="text-stone-500">No friends yet</p>
          <p className="text-stone-400 text-sm mt-1">Add a friend by username</p>
        </div>
      )}

      <div className="space-y-2">
        {friends.map((f) => (
          <Link
            key={f.friendUserId}
            to={`/u/${f.friendUsername}`}
            className="flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm border border-stone-100 hover:shadow-md transition-shadow"
          >
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold">
              {f.friendDisplayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-stone-800">{f.friendDisplayName}</p>
              <p className="text-sm text-stone-500">@{f.friendUsername}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
