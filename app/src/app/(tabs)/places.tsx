import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { PinIcon } from '@/components/icons';
import { PlaceRow } from '@/components/place-row';
import { SkeletonRow } from '@/components/skeleton';
import { Divider, Txt } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { qk } from '@/lib/queryKeys';
import { colors, radius, spacing } from '@/theme';

/**
 * Every cafe this account has rated at, newest visit first — the app's own little map of where you
 * drink, minus the map. Tapping a row opens the place; the arrow next to it hands the coordinates
 * to whichever maps app the device prefers (see `lib/place.ts`).
 */
export default function PlacesScreen() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const router = useRouter();

  const query = useQuery({
    queryKey: qk.userPlaces(me?.username ?? ''),
    queryFn: () => api.userPlaces(me!.username),
    enabled: !!me,
  });

  const places = [...(query.data?.places ?? [])].sort(
    (a, b) => Date.parse(b.lastVisited) - Date.parse(a.lastVisited),
  );

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.bar}>
        <Txt variant="title" tone="heading">
          {t('places.title')}
        </Txt>
      </View>

      {query.isLoading ? (
        <View style={s.padded}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      ) : query.isError ? (
        <EmptyState
          title={t('common.somethingWrong')}
          body={errorMessage(query.error, t)}
          actionLabel={t('common.retry')}
          onAction={() => void query.refetch()}
        />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.placeId}
          contentContainerStyle={s.content}
          renderItem={({ item }) => <PlaceRow place={item} />}
          ItemSeparatorComponent={() => <Divider inset={spacing.lg + 36 + spacing.md} />}
          ListEmptyComponent={
            <EmptyState
              icon={<PinIcon size={26} color={colors.inkFaint} />}
              title={t('places.emptyTitle')}
              body={t('places.emptyBody')}
              actionLabel={t('feed.rateFirst')}
              onAction={() => router.push('/rating/new')}
            />
          }
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  padded: { padding: spacing.lg },
  content: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.line,
    margin: spacing.lg,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
});
