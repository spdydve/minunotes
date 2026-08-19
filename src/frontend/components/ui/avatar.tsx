import { Bot, Sparkles, UserRound } from 'lucide-react';
import type { CollaborationIdentity } from '../../lib/api';
import { getAvatarInitials, getAvatarPaletteIndex } from '../../lib/avatar';

const AVATAR_PALETTE = [
  'border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
  'border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200',
  'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  'border-lime-200 bg-lime-100 text-lime-900 dark:border-lime-800 dark:bg-lime-950 dark:text-lime-200',
  'border-green-200 bg-green-100 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  'border-teal-200 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200',
  'border-cyan-200 bg-cyan-100 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-200',
  'border-sky-200 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  'border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
  'border-indigo-200 bg-indigo-100 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  'border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200',
  'border-purple-200 bg-purple-100 text-purple-800 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200',
  'border-fuchsia-200 bg-fuchsia-100 text-fuchsia-800 dark:border-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200',
  'border-pink-200 bg-pink-100 text-pink-800 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-200',
  'border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200',
] as const;

const AVATAR_SIZE = {
  xs: 'h-5 w-5 text-[8px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
  xl: 'h-12 w-12 text-base',
} as const;

const ICON_SIZE = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
  xl: 'h-6 w-6',
} as const;

export function Avatar({
  identity,
  size = 'md',
  imageUrl,
  className = '',
  decorative = false,
}: {
  identity: CollaborationIdentity;
  size?: keyof typeof AVATAR_SIZE;
  imageUrl?: string | null;
  className?: string;
  decorative?: boolean;
}) {
  const paletteIndex = getAvatarPaletteIndex(identity.key);
  const initials = getAvatarInitials(identity);
  const neutral = identity.type === 'former' || identity.type === 'system';
  const palette = neutral
    ? 'border-[var(--notes-border)] bg-[var(--notes-panel-muted)] text-[var(--notes-muted)]'
    : AVATAR_PALETTE[paletteIndex];
  const accessibilityProps = decorative
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': identity.type === 'agent' ? `${identity.label}, agent` : identity.label } as const);
  const icon =
    identity.type === 'agent' ? (
      <Bot className={ICON_SIZE[size]} aria-hidden="true" />
    ) : identity.type === 'system' ? (
      <Sparkles className={ICON_SIZE[size]} aria-hidden="true" />
    ) : !initials ? (
      <UserRound className={ICON_SIZE[size]} aria-hidden="true" />
    ) : null;

  return (
    <span
      {...accessibilityProps}
      data-avatar-palette={neutral ? 'neutral' : paletteIndex}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border font-semibold uppercase ${AVATAR_SIZE[size]} ${palette} ${className}`}
    >
      {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : (icon ?? initials)}
    </span>
  );
}
