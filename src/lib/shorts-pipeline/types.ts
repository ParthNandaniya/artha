export type VideoShortStatus =
  | "topic_discovered"
  | "script_written"
  | "generating"
  | "generated"
  | "pending_approval"
  | "approved"
  | "posting"
  | "posted"
  | "failed";

export type ContentCategory = "ai_tips" | "tech_trends" | "build_in_public" | "startup_advice";

export type TopicSource = "google_trends" | "reddit" | "twitter" | "web_search" | "manual";

export type VideoLayout = "split_screen" | "full_screen" | "overlay";

export type PostingPlatform = "twitter" | "bluesky";

export interface DiscoveredTopic {
  topic: string;
  source: TopicSource;
  reasoning: string;
  trendScore: number;
  researchData: string;
  category: ContentCategory;
}

export interface VideoScript {
  script: string;
  hook: string;
  cta: string;
  captions: Record<PostingPlatform, string>;
  duration_estimate_seconds: number;
}

export interface AssembledVideo {
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  invideoId: string;
  r2Key: string;
}

export interface PostResult {
  platform: PostingPlatform;
  postUrl: string | null;
  externalPostId: string | null;
  status: "posted" | "failed";
  error: string | null;
}

export interface VideoShort {
  id: string;
  project_id: string | null;
  topic: string;
  topic_source: TopicSource | null;
  topic_research: unknown;
  script: string | null;
  script_hook: string | null;
  script_cta: string | null;
  duration_target: string;
  video_url: string | null;
  thumbnail_url: string | null;
  invideo_id: string | null;
  video_platform: string;
  aspect_ratio: string;
  layout: VideoLayout;
  gameplay_clip_key: string | null;
  variant: string;
  content_category: ContentCategory | null;
  status: VideoShortStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  metadata: Record<string, unknown>;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineConfig {
  project_id: string;
  enabled: boolean;
  frequency: string;
  platforms: PostingPlatform[];
  auto_approve: boolean;
  voice_style: string;
  music_mood: string;
  content_focus: string | null;
  max_per_week: number;
}

export interface PipelineRunOptions {
  projectId?: string | null;
  category?: ContentCategory;
  autoApprove?: boolean;
  platforms?: PostingPlatform[];
  dryRun?: boolean;
}
