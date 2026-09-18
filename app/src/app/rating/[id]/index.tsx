import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { Avatar } from '@/components/avatar';
import { CompanionChips } from '@/components/companion-chips';
import { EmptyState } from '@/components/empty-state';
import { CommentIcon, CupIcon, HeartIcon, PencilIcon, PinIcon, TrashIcon } from '@/components/icons';
import { SkeletonFeed } from '@/components/skeleton';
import { StarRating } from '@/components/star-rating';
import {
  Button,
  Divider,
  IconButton,
  ScreenHeader,
  SectionTitle,
  TextField,
  Txt,
} from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { formatDate } from '@/lib/format';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { useToggleLike } from '@/lib/useToggleLike';
import { colors, radius, spacing } from '@/theme';
import { goBack } from '@/lib/navigation';

/**
 * One rating in full: the photo, what it was, where, who was there, who liked it and what people
 * said. The author gets edit and delete in the header — nowhere else, so nobody hunts for them.
 */
export default function RatingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me } = useAuth();

  const [comment, setComment] = useState('');

  const detail = useQuery({
    queryKey: qk.rating(id),
    queryFn: () => api.rating(id),
    enabled: !!id,
  });

  const { toggleLike } = useToggleLike(
    [qk.feed(), ...(me ? [qk.userRatings(me.username), qk.userTagged(me.username)] : [])],
    [qk.rating(id)],
  );

  const addComment = useMutation({
    mutationFn: (text: string) => api.addComment(id, text),
    onSuccess: () => {
      setComment('');
      void queryClient.invalidateQueries({ queryKey: qk.rating(id) });
      void queryClient.invalidateQueries({ queryKey: qk.feed() });
    },
    onError: (e) => showToast(errorMessage(e, t)),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteRating(id),
    onSuccess: async () => {
      const rating = detail.data?.rating;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.feed() }),
        ...(me
          ? [
              queryClient.invalidateQueries({ queryKey: qk.userRatings(me.username) }),
              queryClient.invalidateQueries({ queryKey: qk.userPlaces(me.username) }),
              queryClient.invalidateQueries({ queryKey: qk.userCaffeine(me.username) }),
            ]
          : []),
        ...(rating
          ? [
              queryClient.invalidateQueries({ queryKey: qk.place(rating.placeId) }),
              queryClient.invalidateQueries({ queryKey: qk.placeRatings(rating.placeId) }),
            ]
          : []),
      ]);
      showToast(t('rating.deleted'));
      goBack();
    },
    onError: (e) => showToast(errorMessage(e, t)),
  });

  if (detail.isLoading) {
    return (
      <View style={s.screen}>
        <ScreenHeader title={t('rating.detailTitle')} onBack={() => goBack()} />
        <View style={s.padded}>
          <SkeletonFeed count={1} />
        </View>
      </View>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <View style={s.screen}>
        <ScreenHeader title={t('rating.detailTitle')} onBack={() => goBack()} />
        <EmptyState
          title={t('rating.notFound')}
          body={detail.error ? errorMessage(detail.error, t) : undefined}
          actionLabel={t('common.retry')}
          onAction={() => void detail.refetch()}
        />
      </View>
    );
  }

  const { rating, likes, comments, isLikedByMe } = detail.data;
  const mine = me?.userId === rating.userId;

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={rating.drinkName}
        subtitle={rating.placeName}
        onBack={() => goBack()}
        right={
          mine ? (
            <>
              <IconButton
                onPress={() => router.push(`/rating/${rating.ratingId}/edit`)}
                accessibilityLabel={t('common.edit')}
                tone="soft">
                <PencilIcon size={18} color={colors.inkSoft} />
              </IconButton>
              <IconButton
                onPress={() =>
                  confirmDestructive(
                    t('rating.deleteConfirmTitle'),
                    t('rating.deleteConfirmBody'),
                    t('common.delete'),
                    () => remove.mutate(),
                  )
                }
                accessibilityLabel={t('common.delete')}
                tone="danger">
                <TrashIcon size={18} color={colors.bad} />
              </IconButton>
            </>
          ) : null
        }
      />

      <KeyboardAwareScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={spacing.xxl}>
          {rating.photoUrl ? (
            <Image
              source={{ uri: rating.photoUrl }}
              style={s.photo}
              contentFit="cover"
              transition={160}
              accessibilityIgnoresInvertColors
            />
          ) : null}

          <Pressable
            onPress={() => router.push(`/u/${rating.username}`)}
            accessibilityRole="button"
            accessibilityLabel={rating.displayName}
            style={({ pressed }) => [s.author, pressed && s.pressed]}>
            <Avatar name={rating.displayName} seed={rating.username} size={44} />
            <View style={s.flex}>
              <Txt variant="headline">{rating.displayName}</Txt>
              <Txt variant="caption" tone="faint">
                @{rating.username} · {formatDate(rating.createdAt, i18n.language)}
              </Txt>
            </View>
          </Pressable>

          <View style={s.summary}>
            <StarRating value={rating.stars} size="md" />
            <Txt variant="title" tone="heading">
              {rating.drinkName}
            </Txt>

            <Pressable
              onPress={() => router.push(`/place/${rating.placeId}`)}
              accessibilityRole="button"
              accessibilityLabel={rating.placeName}
              style={({ pressed }) => [s.metaRow, pressed && s.pressed]}>
              <PinIcon size={16} color={colors.primary} />
              <Txt variant="label" tone="primary" numberOfLines={1} style={s.flex}>
                {rating.placeName}
                {rating.address ? ` · ${rating.address}` : ''}
              </Txt>
            </Pressable>

            {rating.caffeineMg > 0 ? (
              <View style={s.metaRow}>
                <CupIcon size={16} color={colors.inkFaint} />
                <Txt variant="label" tone="soft">
                  {t('rating.caffeineMg', { mg: rating.caffeineMg })}
                </Txt>
              </View>
            ) : null}

            {rating.description ? (
              <Txt variant="body" tone="soft">
                {rating.description}
              </Txt>
            ) : null}

            {rating.companions.length > 0 ? (
              <View style={s.companions}>
                <Txt variant="caption" tone="faint">
                  {t('rating.companions')}
                </Txt>
                <CompanionChips companions={rating.companions} />
              </View>
            ) : null}
          </View>

          <View style={s.actions}>
            <Pressable
              onPress={() => toggleLike(rating.ratingId)}
              accessibilityRole="button"
              accessibilityLabel={isLikedByMe ? t('rating.unlike') : t('rating.like')}
              accessibilityState={{ selected: isLikedByMe }}
              style={({ pressed }) => [s.action, pressed && s.pressed]}>
              <HeartIcon
                size={20}
                filled={isLikedByMe}
                color={isLikedByMe ? colors.bad : colors.inkFaint}
              />
              <Txt variant="label" tone={isLikedByMe ? 'bad' : 'faint'}>
                {rating.likeCount}
              </Txt>
            </Pressable>
            <View style={s.action}>
              <CommentIcon size={20} color={colors.inkFaint} />
              <Txt variant="label" tone="faint">
                {rating.commentCount}
              </Txt>
            </View>
          </View>

          {likes.length > 0 ? (
            <View style={s.section}>
              <SectionTitle>{t('rating.likes')}</SectionTitle>
              <View style={s.group}>
                {likes.map((l, i) => (
                  <View key={l.userId}>
                    <UserRow username={l.username} displayName={l.displayName} />
                    {i < likes.length - 1 ? (
                      <Divider inset={spacing.lg + 40 + spacing.md} />
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          <View style={s.section}>
            <SectionTitle>{t('rating.comments')}</SectionTitle>
            {comments.length === 0 ? (
              <Txt variant="body" tone="faint">
                {t('rating.commentsEmpty')}
              </Txt>
            ) : (
              <View style={s.group}>
                {comments.map((c, i) => (
                  <View key={c.commentId}>
                    <View style={s.comment}>
                      <Avatar name={c.displayName} seed={c.username} size={32} />
                      <View style={s.flex}>
                        <Txt variant="label">{c.displayName}</Txt>
                        <Txt variant="body" tone="soft">
                          {c.text}
                        </Txt>
                        <Txt variant="caption" tone="faint">
                          {formatDate(c.createdAt, i18n.language)}
                        </Txt>
                      </View>
                    </View>
                    {i < comments.length - 1 ? <Divider inset={spacing.lg + 32 + spacing.md} /> : null}
                  </View>
                ))}
              </View>
            )}

            <View style={s.composer}>
              <TextField
                placeholder={t('rating.commentPlaceholder')}
                value={comment}
                onChangeText={setComment}
                maxLength={500}
                multiline
                style={s.commentInput}
              />
              <Button
                title={t('rating.commentSend')}
                size="sm"
                onPress={() => addComment.mutate(comment.trim())}
                loading={addComment.isPending}
                disabled={comment.trim().length === 0}
              />
            </View>
          </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },

  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceAlt,
  },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summary: { gap: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  companions: { gap: spacing.xs, marginTop: spacing.xs },

  actions: {
    flexDirection: 'row',
    gap: spacing.xl,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  section: { gap: spacing.sm },
  group: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  comment: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  composer: { gap: spacing.sm, marginTop: spacing.sm },
  commentInput: { minHeight: 64, textAlignVertical: 'top' },
});
