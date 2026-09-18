import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { CompanionPicker, MAX_COMPANIONS } from '@/components/companion-picker';
import { CameraIcon, CupIcon, PinIcon, PlusIcon, XIcon } from '@/components/icons';
import { PlacePicker, type ChosenPlace } from '@/components/place-picker';
import { SkeletonFeed } from '@/components/skeleton';
import { StarRating } from '@/components/star-rating';
import {
  Button,
  Chip,
  ErrorText,
  IconButton,
  ScreenHeader,
  SectionTitle,
  TextField,
  Txt,
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { resolveCaffeineMg } from '@/lib/caffeine';
import { capturePhoto, pickPhoto, uploadPhoto, type PickedPhoto } from '@/lib/photo';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { colors, radius, spacing } from '@/theme';
import type { Companion } from '@/types';
import { goBack } from '@/lib/navigation';

/**
 * The one form for creating and editing a rating.
 *
 * Create and edit differ in three details (what it is seeded with, which verb the button uses, and
 * where it goes afterwards) and in nothing else, so they share a component rather than drifting
 * apart as two screens that are "almost the same".
 *
 * Field order follows how people actually recall a coffee: how good was it, what was it, where.
 * The photo sits at the top because it is the one thing that has to be taken while you are there.
 */
export function RatingComposer({ ratingId }: { ratingId?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me, refresh } = useAuth();
  const isEdit = !!ratingId;

  const existing = useQuery({
    queryKey: qk.rating(ratingId ?? ''),
    queryFn: () => api.rating(ratingId!),
    enabled: isEdit,
  });

  const myPlaces = useQuery({
    queryKey: qk.userPlaces(me?.username ?? ''),
    queryFn: () => api.userPlaces(me!.username),
    enabled: !!me,
  });

  const [stars, setStars] = useState(0);
  const [drinkName, setDrinkName] = useState('');
  const [description, setDescription] = useState('');
  const [place, setPlace] = useState<ChosenPlace | null>(null);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [caffeineMg, setCaffeineMg] = useState(0);
  const [caffeineSource, setCaffeineSource] = useState<'table' | 'ai' | 'manual'>('table');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [error, setError] = useState('');
  const [placeOpen, setPlaceOpen] = useState(false);
  const [companionsOpen, setCompanionsOpen] = useState(false);
  const [estimating, setEstimating] = useState(false);

  // Seed once from the loaded rating. A guard, not a dependency list: re-running this after the
  // user has started typing would throw their edits away on every background refetch.
  const seeded = useRef(false);
  // In edit mode the caffeine value is the author's, not the table's — only re-derive it once the
  // drink name has actually been changed by hand.
  const drinkTouched = useRef(!isEdit);

  useEffect(() => {
    const rating = existing.data?.rating;
    if (!rating || seeded.current) return;
    seeded.current = true;
    setStars(rating.stars);
    setDrinkName(rating.drinkName);
    setDescription(rating.description ?? '');
    setPlace({
      placeId: rating.placeId,
      placeName: rating.placeName,
      address: rating.address,
      lat: rating.lat,
      lng: rating.lng,
    });
    setCompanions(rating.companions);
    setCaffeineMg(rating.caffeineMg);
    setCaffeineSource('manual');
    setExistingPhotoUrl(rating.photoUrl ?? null);
  }, [existing.data]);

  // Local table lookup, debounced. Instant for the 40-odd drinks anyone actually orders; the server
  // (and its AI fallback) is only asked when this comes up empty and the user taps for it.
  useEffect(() => {
    if (!drinkTouched.current) return;
    const timer = setTimeout(() => {
      const mg = resolveCaffeineMg(drinkName);
      setCaffeineMg(mg);
      setCaffeineSource('table');
    }, 300);
    return () => clearTimeout(timer);
  }, [drinkName]);

  const estimate = async () => {
    if (!drinkName.trim() || estimating) return;
    setEstimating(true);
    try {
      const result = await api.resolveCaffeine(drinkName.trim());
      if (result.source !== 'error') {
        setCaffeineMg(result.caffeineMg);
        setCaffeineSource(result.source === 'ai' ? 'ai' : 'table');
      }
    } catch (e) {
      showToast(errorMessage(e, t));
    } finally {
      setEstimating(false);
    }
  };

  // `from` is the whole difference between the two photo sources; everything after is identical.
  const addPhoto = async (from: 'library' | 'camera') => {
    try {
      const picked = from === 'camera' ? await capturePhoto() : await pickPhoto();
      if (!picked) return; // cancelled, or permission declined — the picker already said so
      setPhoto(picked);
      setPhotoCleared(false);
    } catch (e) {
      showToast(errorMessage(e, t));
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      let photoKey: string | undefined | null;
      if (photo) photoKey = await uploadPhoto(photo);
      else if (isEdit && photoCleared) photoKey = null;
      // else: undefined — no photo on create, unchanged on edit

      const companionInput = companions.map((c) =>
        c.username ? { username: c.username } : { displayName: c.displayName },
      );

      if (isEdit) {
        return api.updateRating(ratingId!, {
          stars,
          drinkName: drinkName.trim(),
          description: description.trim() || null,
          photoKey,
          caffeineMg,
          placeName: place!.placeName,
          lat: place!.lat,
          lng: place!.lng,
          address: place!.address ?? null,
          companions: companionInput,
        });
      }

      return api.createRating({
        placeId: place!.placeId,
        placeName: place!.placeName,
        stars,
        drinkName: drinkName.trim(),
        description: description.trim() || undefined,
        photoKey: photoKey ?? undefined,
        lat: place!.lat,
        lng: place!.lng,
        address: place!.address,
        caffeineMg,
        companions: companionInput,
      });
    },
    onSuccess: async (rating) => {
      // A new rating lands in five different lists plus the author's totals; invalidate the lot
      // rather than trying to splice it in by hand.
      const username = me?.username ?? '';
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.feed() }),
        queryClient.invalidateQueries({ queryKey: qk.userRatings(username) }),
        queryClient.invalidateQueries({ queryKey: qk.userPlaces(username) }),
        queryClient.invalidateQueries({ queryKey: qk.userCaffeine(username) }),
        queryClient.invalidateQueries({ queryKey: qk.place(rating.placeId) }),
        queryClient.invalidateQueries({ queryKey: qk.placeRatings(rating.placeId) }),
        ...(isEdit ? [queryClient.invalidateQueries({ queryKey: qk.rating(ratingId!) })] : []),
      ]);
      void refresh();
      showToast(isEdit ? t('rating.updated') : t('rating.saved'));
      if (isEdit) goBack();
      else router.replace(`/rating/${rating.ratingId}`);
    },
    onError: (e) => setError(errorMessage(e, t)),
  });

  const submit = () => {
    if (stars <= 0) return setError(t('rating.starsRequired'));
    if (!drinkName.trim()) return setError(t('rating.drinkRequired'));
    if (!place) return setError(t('rating.placeRequired'));
    setError('');
    save.mutate();
  };

  if (isEdit && existing.isLoading) {
    return (
      <View style={s.screen}>
        <ScreenHeader title={t('rating.editTitle')} onBack={() => goBack()} />
        <View style={s.padded}>
          <SkeletonFeed count={1} />
        </View>
      </View>
    );
  }

  const photoUri = photo?.uri ?? (photoCleared ? null : existingPhotoUrl);

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={isEdit ? t('rating.editTitle') : t('rating.newTitle')}
        onBack={() => goBack()}
      />

      <KeyboardAwareScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={spacing.xxl}>
          {/* Photo */}
          {photoUri ? (
            <View style={s.photoWrap}>
              <Image source={{ uri: photoUri }} style={s.photo} contentFit="cover" />
              <View style={s.photoActions}>
                <IconButton
                  onPress={() => void addPhoto('library')}
                  accessibilityLabel={t('rating.changePhoto')}
                  tone="soft">
                  <CameraIcon size={18} color={colors.ink} />
                </IconButton>
                <IconButton
                  onPress={() => {
                    setPhoto(null);
                    setPhotoCleared(true);
                  }}
                  accessibilityLabel={t('rating.removePhoto')}
                  tone="danger">
                  <XIcon size={18} color={colors.bad} />
                </IconButton>
              </View>
            </View>
          ) : (
            <View style={s.photoEmpty}>
              <CameraIcon size={26} color={colors.inkFaint} />
              <Txt variant="label" tone="faint">
                {t('rating.addPhoto')}
              </Txt>
              <View style={s.photoChoices}>
                {/* The camera is offered on native only: `launchCameraAsync` on web depends on
                    browser and permissions in ways that are not worth a dead-end button. */}
                {Platform.OS !== 'web' ? (
                  <Button
                    title={t('rating.takePhoto')}
                    variant="ghost"
                    size="sm"
                    onPress={() => void addPhoto('camera')}
                  />
                ) : null}
                <Button
                  title={t('rating.choosePhoto')}
                  variant="ghost"
                  size="sm"
                  onPress={() => void addPhoto('library')}
                />
              </View>
            </View>
          )}

          {/* Stars */}
          <View style={s.field}>
            <SectionTitle>{t('rating.stars')}</SectionTitle>
            <View style={s.starsRow}>
              <StarRating value={stars} onChange={setStars} size="lg" />
            </View>
          </View>

          {/* Drink + caffeine */}
          <View style={s.field}>
            <TextField
              label={t('rating.drink')}
              placeholder={t('rating.drinkPlaceholder')}
              value={drinkName}
              onChangeText={(value) => {
                drinkTouched.current = true;
                setDrinkName(value);
              }}
              autoCapitalize="none"
              maxLength={80}
            />

            {drinkName.trim() ? (
              <View style={s.caffeineRow}>
                <CupIcon size={16} color={colors.inkFaint} />
                <TextField
                  value={String(caffeineMg)}
                  onChangeText={(value) => {
                    setCaffeineMg(Math.max(0, Math.min(2000, parseInt(value, 10) || 0)));
                    setCaffeineSource('manual');
                  }}
                  keyboardType="number-pad"
                  style={s.caffeineInput}
                  accessibilityLabel={t('rating.caffeine')}
                />
                <Txt variant="label" tone="faint">
                  {t('rating.caffeineEdit')}
                </Txt>
                <View style={s.flex} />
                {caffeineMg === 0 ? (
                  <Button
                    title={estimating ? t('common.loading') : t('rating.caffeineAsk')}
                    variant="ghost"
                    size="sm"
                    loading={estimating}
                    onPress={() => void estimate()}
                  />
                ) : (
                  <Txt variant="caption" tone="faint">
                    {caffeineSource === 'ai' ? t('rating.caffeineAi') : t('rating.caffeineTable')}
                  </Txt>
                )}
              </View>
            ) : null}
          </View>

          {/* Place */}
          <View style={s.field}>
            <SectionTitle>{t('rating.place')}</SectionTitle>
            <Pressable
              onPress={() => setPlaceOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('rating.place')}
              style={({ pressed }) => [s.picker, pressed && s.pressed]}>
              <PinIcon size={20} color={place ? colors.primary : colors.inkFaint} />
              <View style={s.flex}>
                <Txt variant="headline" tone={place ? 'ink' : 'faint'} numberOfLines={1}>
                  {place?.placeName ?? t('rating.placePlaceholder')}
                </Txt>
                {place?.address ? (
                  <Txt variant="caption" tone="faint" numberOfLines={1}>
                    {place.address}
                  </Txt>
                ) : null}
              </View>
            </Pressable>
          </View>

          {/* Companions */}
          <View style={s.field}>
            <SectionTitle>{t('rating.companions')}</SectionTitle>
            <View style={s.chips}>
              {companions.map((c, i) => (
                <Chip
                  key={c.userId ?? `${c.displayName}-${i}`}
                  label={c.displayName}
                  tone="accent"
                  onRemove={() => setCompanions(companions.filter((_, j) => j !== i))}
                  removeLabel={c.displayName}
                />
              ))}
              {companions.length < MAX_COMPANIONS ? (
                <Pressable
                  onPress={() => setCompanionsOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('rating.companionsAdd')}
                  style={({ pressed }) => [s.addChip, pressed && s.pressed]}>
                  <PlusIcon size={15} color={colors.primary} />
                  <Txt variant="label" tone="primary">
                    {t('rating.companionsAdd')}
                  </Txt>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Notes */}
          <TextField
            label={t('rating.description')}
            placeholder={t('rating.descriptionPlaceholder')}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            maxLength={500}
            style={s.textarea}
          />

          <ErrorText>{error}</ErrorText>

          <Button
            title={isEdit ? t('rating.update') : t('rating.save')}
            onPress={submit}
            loading={save.isPending}
          />
          {save.isPending && photo ? (
            <View style={s.uploading}>
              <ActivityIndicator color={colors.primary} />
              <Txt variant="caption" tone="faint">
                {t('rating.photoLoading')}
              </Txt>
            </View>
          ) : null}
      </KeyboardAwareScrollView>

      <PlacePicker
        visible={placeOpen}
        onClose={() => setPlaceOpen(false)}
        onSelect={setPlace}
        previousPlaces={myPlaces.data?.places ?? []}
      />
      <CompanionPicker
        visible={companionsOpen}
        onClose={() => setCompanionsOpen(false)}
        selected={companions}
        onChange={setCompanions}
      />
    </View>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl * 2 },
  field: { gap: spacing.sm },

  photoWrap: { borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surfaceAlt },
  photoActions: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  photoEmpty: {
    paddingVertical: spacing.xl,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  photoChoices: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },

  starsRow: { alignItems: 'center', paddingVertical: spacing.sm },

  caffeineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  caffeineInput: { width: 76, paddingVertical: spacing.sm, textAlign: 'center' },

  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 54,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },

  textarea: { minHeight: 96, textAlignVertical: 'top' },
  uploading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center' },
});
