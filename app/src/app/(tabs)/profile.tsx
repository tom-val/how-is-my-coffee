import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { CaffeineStats } from '@/components/caffeine-stats';
import { EmptyState } from '@/components/empty-state';
import { CupIcon, PinIcon } from '@/components/icons';
import { PlaceRow } from '@/components/place-row';
import { RatingCard } from '@/components/rating-card';
import { SkeletonFeed, SkeletonRow } from '@/components/skeleton';
import { Button, Divider, SectionTitle, SegmentedRow, Txt } from '@/components/ui';
import { setLanguage, SUPPORTED, type Lang } from '@/i18n';
import { api, errorMessage, PAGE_SIZE } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { useToggleLike } from '@/lib/useToggleLike';
import {
  APPEARANCE_PREFERENCES,
  colors,
  radius,
  setAppearancePreference,
  spacing,
  useAppearancePreference,
  type AppearancePreference,
} from '@/theme';

type Section = 'ratings' | 'places' | 'tagged';

/**
 * Me: how much caffeine, what I rated, where I have been, who tagged me, and the two settings worth
 * having. One screen rather than a profile plus a settings page — there are exactly two preferences
 * and a sign-out button, which does not earn a route of its own.
 */
export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { me, signOut } = useAuth();
  const router = useRouter();
  const appearance = useAppearancePreference();

  const [section, setSection] = useState<Section>('ratings');
  const username = me?.username ?? '';

  const caffeine = useQuery({
    queryKey: qk.userCaffeine(username),
    queryFn: () => api.userCaffeine(username),
    enabled: !!me,
  });

  const ratings = useQuery({
    queryKey: qk.userRatings(username),
    queryFn: () => api.userRatings(username, { limit: PAGE_SIZE }),
    enabled: !!me && section === 'ratings',
  });

  const places = useQuery({
    queryKey: qk.userPlaces(username),
    queryFn: () => api.userPlaces(username),
    enabled: !!me && section === 'places',
  });

  const tagged = useQuery({
    queryKey: qk.userTagged(username),
    queryFn: () => api.userTagged(username, { limit: PAGE_SIZE }),
    enabled: !!me && section === 'tagged',
  });

  const { toggleLike } = useToggleLike([
    qk.userRatings(username),
    qk.userTagged(username),
    qk.feed(),
  ]);

  const changeAppearance = async (value: AppearancePreference) => {
    const outcome = await setAppearancePreference(value);
    if (outcome === 'restart-required') showToast(t('profile.appearanceRestart'));
  };

  if (!me) return <View style={s.screen} />;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Avatar name={me.displayName} seed={me.username} size={64} />
          <View style={s.headerText}>
            <Txt variant="title" tone="heading" numberOfLines={1}>
              {me.displayName}
            </Txt>
            <Txt variant="label" tone="faint">
              @{me.username}
            </Txt>
            <Txt variant="caption" tone="faint">
              {t('profile.memberSince', { date: formatDate(me.createdAt, i18n.language) })}
            </Txt>
          </View>
        </View>

        <CaffeineStats
          todayMg={caffeine.data?.todayMg ?? 0}
          totalMg={caffeine.data?.totalMg ?? me.totalCaffeineMg ?? 0}
          todayLabel={t('profile.caffeineToday')}
          totalLabel={t('profile.caffeineTotal')}
          unit={t('profile.caffeineUnit')}
        />

        <SegmentedRow<Section>
          value={section}
          onChange={setSection}
          options={[
            { value: 'ratings', label: t('profile.myRatings') },
            { value: 'places', label: t('profile.myPlaces') },
            { value: 'tagged', label: t('profile.coffeesWithMe') },
          ]}
        />

        {section === 'ratings' ? (
          ratings.isLoading ? (
            <SkeletonFeed count={2} />
          ) : ratings.isError ? (
            <EmptyState
              title={t('common.somethingWrong')}
              body={errorMessage(ratings.error, t)}
              actionLabel={t('common.retry')}
              onAction={() => void ratings.refetch()}
            />
          ) : (ratings.data?.ratings ?? []).length === 0 ? (
            <EmptyState
              icon={<CupIcon size={26} color={colors.inkFaint} />}
              title={t('profile.ratingsEmpty')}
              actionLabel={t('feed.rateFirst')}
              onAction={() => router.push('/rating/new')}
            />
          ) : (
            <View style={s.stack}>
              {(ratings.data?.ratings ?? []).map((r) => (
                <RatingCard
                  key={r.ratingId}
                  rating={r}
                  showAuthor={false}
                  liked={ratings.data?.likedRatingIds.includes(r.ratingId)}
                  onToggleLike={toggleLike}
                />
              ))}
            </View>
          )
        ) : null}

        {section === 'places' ? (
          places.isLoading ? (
            <View style={s.group}>
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (places.data?.places ?? []).length === 0 ? (
            <EmptyState
              icon={<PinIcon size={26} color={colors.inkFaint} />}
              title={t('places.emptyTitle')}
              body={t('places.emptyBody')}
            />
          ) : (
            <View style={s.group}>
              {[...(places.data?.places ?? [])]
                .sort((a, b) => Date.parse(b.lastVisited) - Date.parse(a.lastVisited))
                .map((p, i, arr) => (
                  <View key={p.placeId}>
                    <PlaceRow place={p} />
                    {i < arr.length - 1 ? <Divider inset={spacing.lg + 36 + spacing.md} /> : null}
                  </View>
                ))}
            </View>
          )
        ) : null}

        {section === 'tagged' ? (
          tagged.isLoading ? (
            <SkeletonFeed count={2} />
          ) : (tagged.data?.ratings ?? []).length === 0 ? (
            <EmptyState
              icon={<CupIcon size={26} color={colors.inkFaint} />}
              title={t('profile.coffeesWithMeEmpty')}
            />
          ) : (
            <View style={s.stack}>
              {(tagged.data?.ratings ?? []).map((r) => (
                <RatingCard
                  key={r.ratingId}
                  rating={r}
                  liked={tagged.data?.likedRatingIds.includes(r.ratingId)}
                  onToggleLike={toggleLike}
                />
              ))}
            </View>
          )
        ) : null}

        <View style={s.settings}>
          <SectionTitle>{t('profile.settings')}</SectionTitle>

          <View style={s.setting}>
            <Txt variant="label" tone="soft">
              {t('profile.language')}
            </Txt>
            <SegmentedRow<Lang>
              value={(SUPPORTED.find((l) => i18n.language.startsWith(l)) ?? 'en') as Lang}
              onChange={(lang) => void setLanguage(lang)}
              options={[
                { value: 'en', label: 'English' },
                { value: 'lt', label: 'Lietuvių' },
              ]}
            />
          </View>

          <View style={s.setting}>
            <Txt variant="label" tone="soft">
              {t('profile.appearance')}
            </Txt>
            <SegmentedRow<AppearancePreference>
              value={appearance}
              onChange={(value) => void changeAppearance(value)}
              options={APPEARANCE_PREFERENCES.map((value) => ({
                value,
                label: t(
                  value === 'system'
                    ? 'profile.appearanceSystem'
                    : value === 'light'
                      ? 'profile.appearanceLight'
                      : 'profile.appearanceDark',
                ),
              }))}
            />
          </View>

          <Button
            title={t('auth.signOut')}
            variant="danger"
            onPress={() =>
              confirmDestructive(t('auth.signOutConfirm'), undefined, t('auth.signOut'), signOut)
            }
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 3 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  headerText: { flex: 1, gap: 1 },
  stack: { gap: spacing.lg },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
  settings: { gap: spacing.lg, marginTop: spacing.xl },
  setting: { gap: spacing.sm },
});
