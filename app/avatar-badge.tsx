import { avatarFor, avatarImage } from './avatars';

/** A round badge showing an avatar's animal face. Decorative: callers label it. */
export function AvatarBadge({ avatar, size = 40, className = '' }: { avatar: string; size?: number; className?: string }) {
  const { id, background } = avatarFor(avatar);
  return (
    <span
      className={`avatar-badge ${className}`}
      style={{ width: size, height: size, backgroundColor: background, backgroundImage: `url(${avatarImage(id)})` }}
      aria-hidden="true"
    />
  );
}
