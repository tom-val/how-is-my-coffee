import { useId } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Path, Polyline, Rect } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * The app's icon set — hand-drawn 24×24 strokes rather than an icon font or emoji.
 *
 * Emoji as iconography is one of the loudest "made by a machine" tells, and an icon package would
 * drag a whole font in for the dozen glyphs this app uses. These are stroked on a 24-grid at weight
 * 1.8, so they sit next to the DM Sans text without shouting.
 */
type IconProps = { size?: number; color?: ColorValue };

const STROKE = 1.8;

/** Tab icon — the feed. A cup with a saucer and a curl of steam. */
export function CupIcon({ size = 24, color = colors.inkSoft }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path
        d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M3 21h14" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Path
        d="M8 6c0-1 1-1.4 1-2.4M12 6c0-1 1-1.4 1-2.4"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Tab icon — places. */
export function PinIcon({ size = 24, color = colors.inkSoft }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={10} r={2.6} stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

/** Tab icon — friends. */
export function PeopleIcon({ size = 24, color = colors.inkSoft }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8} r={3.4} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M3 20v-1.2A4.8 4.8 0 0 1 7.8 14h2.4a4.8 4.8 0 0 1 4.8 4.8V20"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14h.7a4.8 4.8 0 0 1 4.8 4.8V20"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Tab icon — profile. */
export function PersonIcon({ size = 24, color = colors.inkSoft }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.6} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M4.5 20v-1a5.5 5.5 0 0 1 5.5-5.5h4a5.5 5.5 0 0 1 5.5 5.5v1"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The centre affordance — add a rating. */
export function PlusIcon({ size = 24, color = colors.inkSoft }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * A star, filled `fill` of the way across (0, 0.5 or 1 in practice).
 *
 * The partial fill is the same path drawn twice: an empty one underneath, and a coloured copy
 * clipped to a rectangle `fill` wide. The clip id comes from `useId` because on web every SVG lands
 * in one document, where two stars sharing an id would clip each other.
 */
export function StarIcon({
  size = 24,
  color = colors.amber,
  outline = colors.line,
  fill = 1,
}: IconProps & { outline?: ColorValue; fill?: number }) {
  const clipId = `star-${useId()}`;
  const d =
    'M12 3.2l2.7 5.48 6.05.88-4.38 4.27 1.04 6.02L12 17l-5.41 2.85 1.04-6.02L3.25 9.56l6.05-.88L12 3.2z';
  const ratio = Math.max(0, Math.min(1, fill));
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {ratio > 0 && ratio < 1 ? (
        <Defs>
          <ClipPath id={clipId}>
            <Rect x={0} y={0} width={24 * ratio} height={24} />
          </ClipPath>
        </Defs>
      ) : null}
      <Path d={d} fill={outline} />
      {ratio > 0 ? (
        <Path d={d} fill={color} clipPath={ratio < 1 ? `url(#${clipId})` : undefined} />
      ) : null}
    </Svg>
  );
}

export function HeartIcon({
  size = 24,
  color = colors.inkFaint,
  filled = false,
}: IconProps & { filled?: boolean }) {
  const d =
    'M12 20s-7.3-4.35-7.3-9.4A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.3 3c0 5.05-7.3 9.4-7.3 9.4Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={d}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CommentIcon({ size = 24, color = colors.inkFaint }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 12.5c0 3.6-3.6 6.5-8 6.5a9.5 9.5 0 0 1-2.6-.35L4.5 20l1.2-3.2A6.2 6.2 0 0 1 4 12.5C4 8.9 7.6 6 12 6s8 2.9 8 6.5Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CameraIcon({ size = 24, color = colors.inkSoft }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5h3l1.3-2.2h7.4L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13.5} r={3.4} stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

export function XIcon({ size = 24, color = colors.inkSoft }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronLeftIcon({ size = 24, color = colors.inkSoft }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="14.5,5 8,12 14.5,19"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 24, color = colors.inkFaint }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="9.5,5 16,12 9.5,19"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function SearchIcon({ size = 24, color = colors.inkFaint }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.2} stroke={color} strokeWidth={STROKE} />
      <Path d="M15.6 15.6L20 20" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

export function TrashIcon({ size = 24, color = colors.bad }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 7h14M10 7V5h4v2M7 7l.8 12.1A1 1 0 0 0 8.8 20h6.4a1 1 0 0 0 1-0.9L17 7"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function PencilIcon({ size = 24, color = colors.inkSoft }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 19.5l.6-3.6L15.6 5.4a1.7 1.7 0 0 1 2.4 0l.6.6a1.7 1.7 0 0 1 0 2.4L8.1 18.9l-3.6.6Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CheckIcon({ size = 24, color = colors.primary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="5,12.5 10,17.5 19,7"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** "Open in Maps" — an arrow leaving the box. */
export function ExternalIcon({ size = 24, color = colors.primary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 5h5v5M19 5l-7.5 7.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18 14.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V7.5A1.5 1.5 0 0 1 6 6h3.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The location crosshair on the place picker. */
export function CrosshairIcon({ size = 24, color = colors.primary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={6} stroke={color} strokeWidth={STROKE} />
      <Circle cx={12} cy={12} r={1.6} fill={color} />
      <Path
        d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}
