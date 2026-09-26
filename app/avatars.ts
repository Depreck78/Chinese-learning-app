// Profile avatars people can choose from (Noto Emoji animal faces, see public/avatars/CREDITS.txt).
// Shared with the server, which only accepts these ids.
export const AVATARS = [
  { id: 'cat', name: 'Cat', chinese: '猫', pinyin: 'māo', background: '#fdebc8' },
  { id: 'tiger', name: 'Tiger', chinese: '虎', pinyin: 'hǔ', background: '#fbe0cf' },
  { id: 'rabbit', name: 'Rabbit', chinese: '兔', pinyin: 'tù', background: '#ece6f3' },
  { id: 'dragon', name: 'Dragon', chinese: '龙', pinyin: 'lóng', background: '#dcefdc' },
  { id: 'panda', name: 'Panda', chinese: '熊猫', pinyin: 'xióngmāo', background: '#e7ecef' },
  { id: 'horse', name: 'Horse', chinese: '马', pinyin: 'mǎ', background: '#f6e3d3' },
] as const;

export type AvatarId = (typeof AVATARS)[number]['id'];

export const DEFAULT_AVATAR: AvatarId = 'cat';

export const avatarImage = (id: AvatarId) => `/avatars/${id}.svg`;

export function avatarFor(id: string | null | undefined) {
  return AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0];
}

export function isAvatarId(value: unknown): value is AvatarId {
  return AVATARS.some((avatar) => avatar.id === value);
}
