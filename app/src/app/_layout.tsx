// Per-weight imports, not the package root: the root index pulls in every weight and italic of
// both families (~2 MB of TTFs that nothing renders). These six are the whole type ramp.
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_600SemiBold } from '@expo-google-fonts/dm-sans/600SemiBold';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthGate } from '@/components/auth-gate';
import { ConfirmHost } from '@/components/confirm-host';
import { ToastHost } from '@/components/toast-host';
import i18n from '@/i18n'; // side-effect import: initializes i18n before the first render
import { AuthProvider } from '@/lib/auth';
import '@/theme/appearance'; // side-effect: applies the stored light/dark choice before first render
import { colors, maxContentWidth } from '@/theme';

void i18n; // keep the init side-effect import

void SplashScreen.preventAutoHideAsync();

/**
 * One QueryClient for the app's lifetime.
 *
 * `staleTime` is a minute because coffee ratings are not a trading screen: re-fetching a feed on
 * every tab switch would burn mobile data for content that has not moved. Retries are off for
 * mutations and limited for queries — an offline phone should surface an error the user can act on
 * rather than spin through four backoffs first.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  });
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);

  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    // Hand off from the native splash only once there is real content to show.
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null; // the native splash stays up

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/* "auto" follows the OS appearance — dark glyphs on the light theme, light on dark. */}
          <StatusBar style="auto" />
          {/* Centre a phone-width column so the app does not stretch edge to edge on web/tablet. */}
          <View style={styles.backdrop}>
            <View style={styles.column}>
              <AuthProvider>
                <AuthGate>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.bg },
                    }}>
                    <Stack.Screen name="rating/new" options={{ presentation: 'modal' }} />
                  </Stack>
                </AuthGate>
              </AuthProvider>
            </View>
          </View>
          {/* Bottom of the dialog / toast host stacks (see lib/confirm.ts, lib/toast.ts). */}
          <ConfirmHost />
          <ToastHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: maxContentWidth, backgroundColor: colors.bg },
});
