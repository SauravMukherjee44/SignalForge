/* eslint-disable next/no-img-element -- Local illustrated avatars are not LCP content. */

type AvatarVariant = 'male' | 'female' | 'neutral';

const masculineNames = new Set([
  'aarav',
  'arjun',
  'kabir',
  'rahul',
  'rohan',
  'saurav',
  'sourav',
  'vikram',
]);
const feminineNames = new Set([
  'ananya',
  'diya',
  'ira',
  'meera',
  'mira',
  'priya',
  'riya',
  'sneha',
]);

function avatarVariant(name: string): AvatarVariant {
  const firstName = name.trim().split(/\s+/)[0]?.toLowerCase() || '';
  if (masculineNames.has(firstName)) return 'male';
  if (feminineNames.has(firstName)) return 'female';
  return 'neutral';
}

export function UserAvatar({
  name,
  identity,
  size = 'md',
  speaking = false,
  variant,
}: {
  name: string;
  identity?: string;
  size?: 'sm' | 'md' | 'lg';
  speaking?: boolean;
  variant?: AvatarVariant;
}) {
  const resolvedVariant = variant ?? avatarVariant(name);
  return (
    <span
      className={`user-avatar user-avatar-${size} user-avatar-${resolvedVariant}${speaking ? ' is-speaking' : ''}`}
      title={name}
      data-identity={identity || undefined}
    >
      <img
        src={`/avatars/${resolvedVariant}.svg`}
        alt={`${name}'s account avatar`}
      />
      <i aria-hidden />
    </span>
  );
}
