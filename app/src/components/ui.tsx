import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmHost } from './confirm-host';
import { ChevronLeftIcon, XIcon } from './icons';
import { ToastHost } from './toast-host';
import { colors, fonts, maxContentWidth, radius, shadows, spacing, type, useIsDark } from '@/theme';

/**
 * The shared primitives. Everything here takes its values from `@/theme` — a screen that needs a
 * colour or a font size reaches for a token or a variant, never a literal.
 */

// ── text ──────────────────────────────────────────────────────────────────────

/** Every piece of text in the app goes through here, so no screen picks its own font size. */
export function Txt({
  variant = 'body',
  tone = 'ink',
  style,
  children,
  ...rest
}: React.ComponentProps<typeof Text> & {
  variant?: keyof typeof type;
  tone?: 'ink' | 'soft' | 'faint' | 'heading' | 'primary' | 'bad' | 'onMedia';
}) {
  const toneColor = {
    ink: colors.ink,
    soft: colors.inkSoft,
    faint: colors.inkFaint,
    heading: colors.heading,
    primary: colors.primary,
    bad: colors.bad,
    onMedia: colors.onMedia,
  }[tone];
  return (
    <Text {...rest} style={[type[variant], { color: toneColor }, style]}>
      {children}
    </Text>
  );
}

/** Section label above a group of cards or fields. */
export function SectionTitle({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View style={s.sectionRow}>
      <Txt variant="section" tone="heading" style={s.sectionFlex}>
        {children}
      </Txt>
      {right}
    </View>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <Txt variant="label" tone="bad" accessibilityRole="alert">
      {children}
    </Txt>
  );
}

// ── buttons ───────────────────────────────────────────────────────────────────

const buttonVariants = {
  primary: { bg: colors.primary, ink: colors.primaryInk, border: 'transparent' as const },
  accent: { bg: colors.amber, ink: colors.mocha, border: 'transparent' as const },
  ghost: { bg: colors.surface, ink: colors.primary, border: colors.line },
  quiet: { bg: colors.surfaceAlt, ink: colors.inkSoft, border: 'transparent' as const },
  danger: { bg: colors.badSoft, ink: colors.bad, border: colors.bad },
} as const;

const buttonSizes = {
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36 },
  md: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 48 },
} as const;

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  size = 'md',
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  const isDisabled = !!(disabled || loading);
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        s.btn,
        buttonSizes[size],
        { backgroundColor: v.bg, borderColor: v.border },
        isDisabled && s.dim,
        pressed && !isDisabled && s.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={v.ink} />
      ) : (
        <Text numberOfLines={1} style={[s.btnText, { color: v.ink }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/** A compact tappable icon — pass an icon element as children. */
export function IconButton({
  onPress,
  children,
  accessibilityLabel,
  tone = 'plain',
  disabled,
}: {
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel: string;
  tone?: 'plain' | 'soft' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        s.iconBtn,
        tone === 'soft' && s.iconBtnSoft,
        tone === 'danger' && s.iconBtnDanger,
        disabled && s.dim,
        pressed && !disabled && s.pressed,
      ]}>
      {children}
    </Pressable>
  );
}

// ── input ─────────────────────────────────────────────────────────────────────

export function TextField({
  label,
  hint,
  error,
  style,
  ref,
  ...rest
}: TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  ref?: React.Ref<TextInput>;
}) {
  // The iOS keyboard chrome is drawn by the system, outside our views, so it cannot read a dynamic
  // colour — it needs a literal scheme. Every TextInput in the app funnels through here.
  const isDark = useIsDark();
  return (
    <View style={s.fieldGroup}>
      {label ? (
        <Txt variant="label" tone="soft">
          {label}
        </Txt>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.inkFaint}
        keyboardAppearance={isDark ? 'dark' : 'light'}
        {...rest}
        style={[s.input, !!error && s.inputError, style]}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!error && hint ? (
        <Txt variant="caption" tone="faint">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

// ── surfaces ──────────────────────────────────────────────────────────────────

/**
 * A raised surface. Used sparingly: rating cards and the stat block earn one, list rows do not —
 * they group with a shared background and hairlines instead, which is what the platform does.
 */
export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (!onPress) return <View style={[s.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [s.card, pressed && s.pressed, style]}>
      {children}
    </Pressable>
  );
}

/** A hairline between grouped rows. */
export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[s.divider, { marginLeft: inset }]} />;
}

/** Selectable pill — filters, companion suggestions, appearance and language choices. */
export function Chip({
  label,
  selected,
  onPress,
  onRemove,
  removeLabel,
  accessibilityLabel,
  tone = 'default',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  accessibilityLabel?: string;
  tone?: 'default' | 'accent';
}) {
  const body = (
    <>
      <Text numberOfLines={1} style={[s.chipText, selected && s.chipTextOn]}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={removeLabel ?? label}>
          <XIcon size={14} color={selected ? colors.primary : colors.inkFaint} />
        </Pressable>
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={[s.chip, selected && s.chipOn, tone === 'accent' && s.chipAccent]}>{body}</View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        s.chip,
        selected && s.chipOn,
        tone === 'accent' && s.chipAccent,
        pressed && s.pressed,
      ]}>
      {body}
    </Pressable>
  );
}

// ── chrome ────────────────────────────────────────────────────────────────────

/**
 * Top bar for a pushed screen: back chevron, title, optional right slot.
 *
 * It claims the top inset itself and paints it `surface`, so the status-bar strip is one continuous
 * band with the bar rather than a darker slab above it. Screens rendering this must not also take
 * the `top` safe-area edge.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <SafeAreaView edges={['top']} style={s.headerSafe}>
      <View style={s.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [s.back, pressed && s.pressed]}>
            <ChevronLeftIcon size={24} color={colors.primary} />
          </Pressable>
        ) : null}
        <View style={s.headerTitles}>
          <Txt variant="section" tone="heading" numberOfLines={1}>
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="caption" tone="faint" numberOfLines={1}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        <View style={s.headerRight}>{right}</View>
      </View>
    </SafeAreaView>
  );
}

/**
 * Tap-to-dismiss filler for a modal — an absolutely-filling `Pressable` rendered as a SIBLING of
 * the surface, before it, so the surface draws on top and keeps its own taps.
 *
 * Never wrap the surface in it: on iOS a `Pressable` ancestor takes the JS responder on touch-down
 * and kills scrolling in every `ScrollView` underneath.
 */
export function Backdrop({ onPress }: { onPress: () => void }) {
  return <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessible={false} />;
}

/**
 * Bottom sheet for the pickers. Hosts its own confirm dialog and toast while open: on iOS the root
 * hosts sit *underneath* this modal, where a dialog swallows every touch and a toast is never seen.
 */
export function Sheet({
  visible,
  onClose,
  title,
  compact,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Size to the content (short menus) instead of the full 88% height. */
  compact?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <Backdrop onPress={onClose} />
        <View style={[s.sheet, compact && s.sheetCompact]}>
          <View style={s.sheetGrab} />
          <View style={s.sheetHeader}>
            <Txt variant="section" tone="heading" numberOfLines={1} style={s.sectionFlex}>
              {title}
            </Txt>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={({ pressed }) => [s.sheetClose, pressed && s.pressed]}>
              <XIcon size={18} color={colors.inkSoft} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
      {/* Gated on `visible`, not left to the Modal: react-native-web keeps a hidden modal's
          children mounted, which would leave a closed sheet claiming the dialog. */}
      {visible ? <ConfirmHost scoped /> : null}
      {visible ? <ToastHost scoped /> : null}
    </Modal>
  );
}

/** A full-width row of options, one selected — appearance and language pickers. */
export function SegmentedRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={s.segment}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [s.segmentItem, on && s.segmentItemOn, pressed && s.pressed]}>
            <Text numberOfLines={1} style={[s.segmentText, on && s.segmentTextOn]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Scrollable body for a screen — one place for the column padding. */
export function Body({
  children,
  contentStyle,
  ...rest
}: React.ComponentProps<typeof ScrollView> & { contentStyle?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      {...rest}
      contentContainerStyle={[s.body, contentStyle]}>
      {children}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.68 },
  dim: { opacity: 0.45 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionFlex: { flex: 1 },

  btn: {
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: fonts.bold, fontSize: 15 },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnSoft: { backgroundColor: colors.surfaceAlt },
  iconBtnDanger: { backgroundColor: colors.badSoft },

  fieldGroup: { gap: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.ink,
  },
  inputError: { borderColor: colors.bad },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    boxShadow: shadows.card,
  },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipAccent: { borderColor: colors.warnLine, backgroundColor: colors.amberSoft },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft, maxWidth: 200 },
  chipTextOn: { color: colors.primary },

  headerSafe: { backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitles: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: maxContentWidth,
    height: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sheetCompact: { height: 'auto', maxHeight: '70%', paddingBottom: spacing.xxl },
  sheetGrab: {
    width: 42,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },

  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  segmentItemOn: { backgroundColor: colors.surface, boxShadow: shadows.card },
  segmentText: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  segmentTextOn: { color: colors.ink, fontFamily: fonts.semibold },

  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
});
