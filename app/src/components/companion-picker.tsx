import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from './avatar';
import { CheckIcon, PeopleIcon } from './icons';
import { Divider, Sheet, TextField, Txt } from './ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { qk } from '@/lib/queryKeys';
import { useDebounced } from '@/lib/useDebounced';
import { colors, radius, spacing } from '@/theme';
import type { Companion } from '@/types';

/** The API's ceiling, mirrored so the UI stops adding before the server refuses. */
export const MAX_COMPANIONS = 10;

/**
 * Who drank this coffee with you.
 *
 * Three ways in, and the third is the point: most of the people you have coffee with are not on
 * this app. Friends you follow are one tap, anyone registered can be found by username, and anyone
 * else becomes a guest — a name on the rating with no account behind it. A guest chip looks the
 * same as a member's; the difference is only that it does not link anywhere.
 */
export function CompanionPicker({
  visible,
  onClose,
  selected,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  selected: Companion[];
  onChange: (companions: Companion[]) => void;
}) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim().toLowerCase(), 300);

  const friends = useQuery({ queryKey: qk.friends(), queryFn: api.friends, enabled: visible });
  const results = useQuery({
    queryKey: qk.userSearch(debounced),
    queryFn: () => api.searchUsers(debounced),
    enabled: visible && debounced.length >= 2,
  });

  const full = selected.length >= MAX_COMPANIONS;
  const isPicked = (username?: string, displayName?: string) =>
    selected.some((c) =>
      username ? c.username === username : !c.username && c.displayName === displayName,
    );

  const toggleMember = (companion: Companion) => {
    if (isPicked(companion.username)) {
      onChange(selected.filter((c) => c.username !== companion.username));
      return;
    }
    if (full) return;
    onChange([...selected, companion]);
  };

  const addGuest = () => {
    const name = query.trim();
    if (!name || full || isPicked(undefined, name)) return;
    onChange([...selected, { displayName: name }]);
    setQuery('');
  };

  // Friends already followed, minus anyone the search is about to show anyway.
  const friendRows = (friends.data?.friends ?? []).filter((f) =>
    debounced ? f.friendUsername.includes(debounced) || f.friendDisplayName.toLowerCase().includes(debounced) : true,
  );
  const searchRows = (results.data?.users ?? []).filter(
    (u) => u.userId !== me?.userId && !friendRows.some((f) => f.friendUserId === u.userId),
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={t('rating.companions')}>
      <TextField
        placeholder={t('friends.addPlaceholder')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="search"
      />
      <Txt variant="caption" tone="faint" style={s.hint}>
        {full ? t('rating.companionsMax') : `${selected.length}/${MAX_COMPANIONS}`}
      </Txt>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={s.list}>
        {query.trim().length > 0 && !isPicked(undefined, query.trim()) ? (
          <Pressable
            onPress={addGuest}
            disabled={full}
            accessibilityRole="button"
            accessibilityLabel={t('rating.companionsGuest', { name: query.trim() })}
            style={({ pressed }) => [s.guest, full && s.dim, pressed && s.pressed]}>
            <Avatar name={query.trim()} seed={query.trim()} size={34} />
            <Txt variant="headline" tone="primary" numberOfLines={1} style={s.flex}>
              {t('rating.companionsGuest', { name: query.trim() })}
            </Txt>
          </Pressable>
        ) : null}

        {friendRows.length > 0 ? (
          <>
            <Txt variant="label" tone="faint" style={s.groupLabel}>
              {t('friends.following')}
            </Txt>
            <View style={s.group}>
              {friendRows.map((f, i, arr) => (
                <View key={f.friendUserId}>
                  <PersonRow
                    displayName={f.friendDisplayName}
                    username={f.friendUsername}
                    picked={isPicked(f.friendUsername)}
                    disabled={full && !isPicked(f.friendUsername)}
                    onPress={() =>
                      toggleMember({
                        userId: f.friendUserId,
                        username: f.friendUsername,
                        displayName: f.friendDisplayName,
                      })
                    }
                  />
                  {i < arr.length - 1 ? <Divider inset={spacing.md + 34 + spacing.md} /> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {debounced.length >= 2 ? (
          <>
            <Txt variant="label" tone="faint" style={s.groupLabel}>
              {t('common.search')}
            </Txt>
            <View style={s.group}>
              {results.isLoading ? (
                <View style={s.status}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : searchRows.length === 0 ? (
                <View style={s.status}>
                  <PeopleIcon size={18} color={colors.inkFaint} />
                  <Txt variant="label" tone="soft">
                    {t('friends.noResults')}
                  </Txt>
                </View>
              ) : (
                searchRows.map((u, i, arr) => (
                  <View key={u.userId}>
                    <PersonRow
                      displayName={u.displayName}
                      username={u.username}
                      picked={isPicked(u.username)}
                      disabled={full && !isPicked(u.username)}
                      onPress={() =>
                        toggleMember({
                          userId: u.userId,
                          username: u.username,
                          displayName: u.displayName,
                        })
                      }
                    />
                    {i < arr.length - 1 ? <Divider inset={spacing.md + 34 + spacing.md} /> : null}
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}

        {friendRows.length === 0 && debounced.length < 2 && !query.trim() ? (
          <View style={s.status}>
            <Txt variant="body" tone="soft">
              {t('rating.companionsEmpty')}
            </Txt>
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

function PersonRow({
  displayName,
  username,
  picked,
  disabled,
  onPress,
}: {
  displayName: string;
  username: string;
  picked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={displayName}
      accessibilityState={{ selected: picked, disabled }}
      style={({ pressed }) => [s.row, disabled && s.dim, pressed && s.pressed]}>
      <Avatar name={displayName} seed={username} size={34} />
      <View style={s.flex}>
        <Txt variant="headline" numberOfLines={1}>
          {displayName}
        </Txt>
        <Txt variant="caption" tone="faint" numberOfLines={1}>
          @{username}
        </Txt>
      </View>
      {picked ? <CheckIcon size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.65 },
  dim: { opacity: 0.4 },
  flex: { flex: 1 },
  hint: { marginTop: spacing.xs },
  list: { flex: 1, marginTop: spacing.sm },
  groupLabel: { marginTop: spacing.md, marginBottom: spacing.xs },
  group: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  guest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
});
