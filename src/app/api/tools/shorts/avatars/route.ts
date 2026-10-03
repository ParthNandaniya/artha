import { NextResponse } from "next/server";
import { UGC_AVATARS, getAvatarUrl } from "@/lib/ugc-shorts/avatars";

export async function GET() {
  const avatars = UGC_AVATARS.map((a) => ({
    id: a.id,
    name: a.name,
    gender: a.gender,
    description: a.description,
    imageUrl: getAvatarUrl(a.r2Key),
    thumbnailUrl: a.thumbnailUrl,
  }));
  return NextResponse.json({ avatars });
}
