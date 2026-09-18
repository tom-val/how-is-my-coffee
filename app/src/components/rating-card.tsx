import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from './avatar';
import { CompanionChips } from './companion-chips';
import { CommentIcon, CupIcon, HeartIcon } from './icons';
import { StarRating } from './star-rating';
import { Txt } from './ui';
import { formatAge } from '@/lib/format';
import { colors, radius, shadows, spacing } from '@/theme';
import type { Rating } from '@/types';

/**
 * One coffee, as it appears in every list.
 *
 * The card leads with the photo when there is one — that is the thing people scroll for — and the
 * text block underneath answers "who, where, what, how good" in that order. The like button is a
 * real button inside the card's own press target, so tapping the heart must not also open the
 * detail screen; it sits in its own row below the divider where the two targets cannot overlap.
 */
export function RatingCard({
  rating,
  liked,
  onToggleLike,
  showAuthor = true,
  showPlace = true,
}: {
  rating: Rating;
  liked?: boolean;
  onToggleLike?: (ratingId: string) => void;
  showAuthor?: boolean;
  showPlace?: boolean;
}) {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const open = () => router.push(`/rating/${rating.ratingId}`);

  return (
    <View style={s.card}>
      {/* No accessibilityRole here on purpose: on web a role="button" Pressable renders a <button>,
          and the author / place / companion pressables inside it are buttons too — nested buttons
          are invalid HTML (React logs a hydration error). Without the role this renders a plain
          clickable <div>; the inner controls keep their proper button semantics. */}
      <Pressable
        onPress={open}
        accessibilityLabel={`${rating.drinkName} — ${rating.placeName}`}
        style={({ pressed }) => pressed && s.pressed}>
        {rating.photoUrl ? (
          <Image
            source={{ uri: rating.photoUrl }}
            style={s.photo}
            contentFit="cover"
            transition={160}
            accessibilityIgnoresInvertColors
          />
        ) : null}

        <View style={s.body}>
          <View style={s.headRow}>
            {showAuthor ? (
              <Pressable
                onPress={() => router.push(`/u/${rating.username}`)}
                accessibilityRole="button"
                accessibilityLabel={`@${rating.username}`}
                style={s.author}>
                <Avatar name={rating.displayName} seed={rating.username} size={34} />
                <View style={s.authorText}>
                  <Txt variant="headline" numberOfLines={1}>
                    {rating.displayName}
                  </Txt>
                  <Txt variant="caption" tone="faint" numberOfLines={1}>
                    @{rating.username}
                  </Txt>
                </View>
              </Pressable>
            ) : (
              <View style={s.authorText}>
                <Txt variant="headline" numberOfLines={1}>
                  {rating.drinkName}
                </Txt>
              </View>
            )}
            <Txt variant="caption" tone="faint">
              {formatAge(rating.createdAt, i18n.language)}
            </Txt>
          </View>

          <View style={s.metaRow}>
            <StarRating value={rating.stars} size="sm" />
            {rating.caffeineMg > 0 ? (
              <View style={s.caffeine}>
                <CupIcon size={13} color={colors.inkFaint} />
                <Txt variant="caption" tone="faint">
                  {t('rating.caffeineMg', { mg: rating.caffeineMg })}
                </Txt>
              </View>
            ) : null}
          </View>

          {showAuthor ? (
            <Txt variant="headline" numberOfLines={1}>
              {rating.drinkName}
            </Txt>
          ) : null}

          {showPlace ? (
            <Pressable
              onPress={() => router.push(`/place/${rating.placeId}`)}
              accessibilityRole="button"
              accessibilityLabel={rating.placeName}>
              <Txt variant="label" tone="primary" numberOfLines={1}>
                {rating.placeName}
              </Txt>
            </Pressable>
          ) : null}

          {rating.description ? (
            <Txt variant="body" tone="soft" numberOfLines={4}>
              {rating.description}
            </Txt>
          ) : null}

          <CompanionChips companions={rating.companions} />
        </View>
      </Pressable>

      <View style={s.actions}>
        <Pressable
          onPress={() => onToggleLike?.(rating.ratingId)}
          disabled={!onToggleLike}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={liked ? t('rating.unlike') : t('rating.like')}
          accessibilityState={{ selected: !!liked }}
          style={({ pressed }) => [s.action, pressed && s.pressed]}>
          <HeartIcon size={19} filled={!!liked} color={liked ? colors.bad : colors.inkFaint} />
          {rating.likeCount > 0 ? (
            <Txt variant="caption" tone={liked ? 'bad' : 'faint'}>
              {rating.likeCount}
            </Txt>
          ) : null}
        </Pressable>

        <Pressable
          onPress={open}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('rating.comments')}
          style={({ pressed }) => [s.action, pressed && s.pressed]}>
          <CommentIcon size={19} color={colors.inkFaint} />
          {rating.commentCount > 0 ? (
            <Txt variant="caption" tone="faint">
              {rating.commentCount}
            </Txt>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.85 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    boxShadow: shadows.card,
  },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surfaceAlt },
  body: { padding: spacing.lg, gap: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  authorText: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  caffeine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 24 },
});
