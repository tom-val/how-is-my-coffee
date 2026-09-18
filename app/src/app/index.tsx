import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

/**
 * `/` — not a screen, just the fork. Expo Router needs a route matching "/", and the honest answer
 * there is "wherever this session belongs": the feed when signed in, the login screen otherwise.
 */
export default function Index() {
  const { signedIn } = useAuth();
  return <Redirect href={signedIn ? '/feed' : '/login'} />;
}
