import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { BottomNav } from './components/BottomNav';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { NewRatingPage } from './pages/NewRatingPage';
import { MyRatingsPage } from './pages/MyRatingsPage';
import { PlacesPage } from './pages/PlacesPage';
import { PlaceDetailPage } from './pages/PlaceDetailPage';
import { FriendsPage } from './pages/FriendsPage';
import { FriendRatingsPage } from './pages/FriendRatingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { RatingDetailPage } from './pages/RatingDetailPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function ProtectedLayout() {
  const { isLoggedIn, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="text-stone-400">Loading...</div>
      </div>
    );
  }

  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-lg mx-auto">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}

function AuthRoute() {
  const { isLoggedIn, loading } = useAuth();
  if (loading) return null;
  if (isLoggedIn) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<AuthRoute />} />
            {/* Public route for viewing friend profiles */}
            <Route path="/u/:username" element={
              <div className="min-h-screen bg-stone-50">
                <div className="max-w-lg mx-auto">
                  <FriendRatingsPage />
                </div>
              </div>
            } />
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/rate" element={<NewRatingPage />} />
              <Route path="/my-ratings" element={<MyRatingsPage />} />
              <Route path="/places" element={<PlacesPage />} />
              <Route path="/places/:placeId" element={<PlaceDetailPage />} />
              <Route path="/ratings/:ratingId" element={<RatingDetailPage />} />
              <Route path="/friends" element={<FriendsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
