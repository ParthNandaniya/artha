export interface UgcAvatar {
  id: string;
  name: string;
  gender: "male" | "female";
  description: string;
  /** R2 key for the full-res avatar image (used by video pipeline). */
  r2Key: string;
  /** Public thumbnail URL for the avatar picker UI. */
  thumbnailUrl: string;
}

/** Resolve an avatar R2 key to a full public URL */
export function getAvatarUrl(r2Key: string): string {
  return `https://pub-artha.r2.dev/${r2Key}`;
}

export const UGC_AVATARS: UgcAvatar[] = [
  {
    id: "male-1",
    name: "Jake",
    gender: "male",
    description: "Confident smile, warm vibes",
    r2Key: "ugc-avatars/male-1.jpg",
    thumbnailUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&h=500&fit=crop&crop=face",
  },
  {
    id: "male-2",
    name: "Marcus",
    gender: "male",
    description: "Casual cool, effortless style",
    r2Key: "ugc-avatars/male-2.jpg",
    thumbnailUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=500&fit=crop&crop=face",
  },
  {
    id: "male-3",
    name: "Leo",
    gender: "male",
    description: "Sharp look, magnetic energy",
    r2Key: "ugc-avatars/male-3.jpg",
    thumbnailUrl: "https://images.unsplash.com/photo-1531891437562-4301cf35b7e4?w=400&h=500&fit=crop&crop=face",
  },
  {
    id: "female-1",
    name: "Sophie",
    gender: "female",
    description: "Sun-kissed glow, natural beauty",
    r2Key: "ugc-avatars/female-1.jpg",
    thumbnailUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=500&fit=crop&crop=face",
  },
  {
    id: "female-2",
    name: "Maya",
    gender: "female",
    description: "Stunning gaze, golden hour glow",
    r2Key: "ugc-avatars/female-2.jpg",
    thumbnailUrl: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&h=500&fit=crop&crop=face",
  },
  {
    id: "female-3",
    name: "Elena",
    gender: "female",
    description: "Alluring smile, captivating look",
    r2Key: "ugc-avatars/female-3.jpg",
    thumbnailUrl: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=500&fit=crop&crop=face",
  },
];
