import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandHeader } from '@/components/brand-header';
import { RatingList } from '@/components/rating-list';
import { api, PAGE_SIZE } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { qk } from '@/lib/queryKeys';
import { colors } from '@/theme';

/**
 * The feed: my coffees, the coffees of people I follow, and coffees I was tagged in — newest first,
 * merged server-side. There is no filter control: the whole list is short by construction (it is
 * your friends, not the internet), and a filter would be one more thing to explain.
 */
export default function FeedScreen() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const router = useRouter();

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <BrandHeader title={t('feed.title')} />
      <RatingList
        queryKey={qk.feed()}
        fetchPage={(cursor) => api.feed({ cursor, limit: PAGE_SIZE })}
        likeKeys={me ? [qk.userRatings(me.username), qk.userTagged(me.username)] : []}
        emptyTitle={t('feed.emptyTitle')}
        emptyBody={t('feed.emptyBody')}
        emptyAction={{ label: t('feed.rateFirst'), onPress: () => router.push('/rating/new') }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
