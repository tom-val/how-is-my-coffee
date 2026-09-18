import { Tabs, useRouter } from 'expo-router';
import type { ComponentProps, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CupIcon, PeopleIcon, PersonIcon, PinIcon, PlusIcon } from './icons';
import { colors, fonts, radius, shadows, spacing } from '@/theme';

/** The props `Tabs` hands its `tabBar`, derived rather than imported: `@react-navigation/*` is not
 *  ours to import directly, and `expo-router/react-navigation` does not re-export the tabs types. */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

type IconProps = { size?: number; color?: ColorValue };

const TAB_ICONS: Record<string, (props: IconProps) => ReactElement> = {
  feed: CupIcon,
  places: PinIcon,
  friends: PeopleIcon,
  profile: PersonIcon,
};

const TAB_LABELS: Record<string, string> = {
  feed: 'tabs.feed',
  places: 'tabs.places',
  friends: 'tabs.friends',
  profile: 'tabs.profile',
};

/**
 * The bottom bar: four tabs with a raised "rate" button between them.
 *
 * Rating a coffee is the whole point of the app, so it gets the centre and a filled amber circle —
 * the one place the accent is used at full strength. It is NOT a tab: it opens the composer as a
 * modal over whatever you were looking at, so you come back to the same place afterwards. That is
 * why this is a custom bar rather than a five-tab `Tabs` with a dummy screen.
 */
export function TabBar({ state, navigation }: TabBarProps) {
  const { t } = useTranslation();
  const router = useRouter();
  // Android keeps `softwareKeyboardLayoutMode` at its default `resize` (what keyboard-controller
  // wants), which would otherwise park this bar on top of the keyboard. Expo's documented
  // alternative to switching the whole window to `pan` is to hide the bar instead — and a tab bar
  // is not something anyone reaches for mid-sentence on either platform.
  const { isVisible: keyboardVisible } = useKeyboardState();
  if (keyboardVisible) return null;

  const routes = state.routes.filter((r) => r.name in TAB_ICONS);
  const middle = Math.ceil(routes.length / 2);
  const left = routes.slice(0, middle);
  const right = routes.slice(middle);

  const renderTab = (route: (typeof routes)[number]) => {
    const index = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;
    const Icon = TAB_ICONS[route.name];
    const label = t(TAB_LABELS[route.name]);
    const tint = focused ? colors.primary : colors.inkFaint;

    return (
      <Pressable
        key={route.key}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        style={({ pressed }) => [s.tab, pressed && s.pressed]}>
        <Icon size={23} color={tint} />
        <Text numberOfLines={1} style={[s.label, { color: tint }]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['bottom']} style={s.safe}>
      <View style={s.bar}>
        <View style={s.side}>{left.map(renderTab)}</View>

        <Pressable
          onPress={() => router.push('/rating/new')}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.rate')}
          style={({ pressed }) => [s.fab, pressed && s.fabPressed]}>
          <PlusIcon size={26} color={colors.mocha} />
        </Pressable>

        <View style={s.side}>{right.map(renderTab)}</View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.6 },
  safe: { backgroundColor: colors.surface },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  side: { flex: 1, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 2 },
  label: { fontSize: 11, fontFamily: fonts.medium },
  fab: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.sm,
    // Lifted out of the bar so it reads as the primary action rather than a fifth tab.
    marginTop: -22,
    borderWidth: 4,
    borderColor: colors.surface,
    boxShadow: shadows.raised,
  },
  fabPressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
