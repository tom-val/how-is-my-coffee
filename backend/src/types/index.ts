export interface User {
  userId: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export interface Rating {
  ratingId: string;
  userId: string;
  placeId: string;
  placeName: string;
  stars: number;
  description?: string;
  photoKey?: string;
  photoUrl?: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export interface Place {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  avgRating: number;
  ratingCount: number;
}

export interface UserPlace {
  userId: string;
  placeId: string;
  placeName: string;
  lat: number;
  lng: number;
  lastVisited: string;
  visitCount: number;
}

export interface Friend {
  userId: string;
  friendUserId: string;
  friendUsername: string;
  friendDisplayName: string;
  addedAt: string;
}
