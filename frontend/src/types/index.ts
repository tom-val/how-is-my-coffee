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
  drinkName?: string;
  description?: string;
  photoKey?: string;
  photoUrl?: string;
  lat: number;
  lng: number;
  createdAt: string;
  username?: string;
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
  placeId: string;
  placeName: string;
  lat: number;
  lng: number;
  address?: string;
  lastVisited: string;
  visitCount: number;
}

export interface Friend {
  friendUserId: string;
  friendUsername: string;
  friendDisplayName: string;
  addedAt: string;
}
