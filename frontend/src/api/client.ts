import type { User, Rating, Place, UserPlace, Friend, CaffeineStats } from '../types';

export interface PaginatedRatings {
  ratings: Rating[];
  nextCursor: string | null;
}

function withParams(path: string, params: Record<string, string | undefined>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  return qs ? `${path}?${qs}` : path;
}

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

let currentUserId: string | null = localStorage.getItem('userId');

export function setUserId(id: string | null) {
  currentUserId = id;
  if (id) localStorage.setItem('userId', id);
  else localStorage.removeItem('userId');
}

export function getUserId(): string | null {
  return currentUserId;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(currentUserId && { 'x-user-id': currentUserId }),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // Auth
  register(username: string, displayName: string, password: string) {
    return request<User>('/users', {
      method: 'POST',
      body: JSON.stringify({ username, displayName, password }),
    });
  },
  login(username: string, password: string) {
    return request<User>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  getUser(username: string) {
    return request<User>(`/users/${username}`);
  },

  // Ratings
  createRating(data: {
    placeId: string;
    placeName: string;
    stars: number;
    drinkName: string;
    description?: string;
    photoKey?: string;
    lat: number;
    lng: number;
    address?: string;
  }) {
    return request<{ ratingId: string }>('/ratings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  getUserRatings(userId: string, cursor?: string) {
    return request<PaginatedRatings>(withParams(`/users/${userId}/ratings`, { cursor }));
  },

  // Places
  getUserPlaces(userId: string) {
    return request<{ places: UserPlace[] }>(`/users/${userId}/places`);
  },
  getPlace(placeId: string) {
    return request<Place>(`/places/${placeId}`);
  },
  getPlaceRatings(placeId: string, cursor?: string) {
    return request<PaginatedRatings>(withParams(`/places/${placeId}/ratings`, { cursor }));
  },

  // Friends
  addFriend(friendUsername: string) {
    return request<Friend>('/friends', {
      method: 'POST',
      body: JSON.stringify({ friendUsername }),
    });
  },
  getFriends(userId: string) {
    return request<{ friends: Friend[] }>(`/users/${userId}/friends`);
  },

  // Caffeine
  getCaffeineStats(userId: string) {
    return request<CaffeineStats>(`/users/${userId}/caffeine`);
  },

  // Feed
  getFeed(cursor?: string) {
    return request<PaginatedRatings>(withParams('/feed', { cursor }));
  },

  // Photos
  getPresignedUrl(fileName: string, contentType: string) {
    return request<{ uploadUrl: string; key: string }>('/photos/upload-url', {
      method: 'POST',
      body: JSON.stringify({ fileName, contentType }),
    });
  },
  async uploadPhoto(file: File): Promise<string> {
    const { uploadUrl, key } = await this.getPresignedUrl(file.name, file.type);
    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    return key;
  },
};
