/**
 * Centralized config for non-LLM video/audio tool models.
 *
 * Change these values to swap providers or models without touching pipeline code.
 */
export const VIDEO_TOOL_CONFIG = {
  /** Replicate model identifier for UGC video generation (image-to-video). */
  ugc_video_model: "minimax/video-01-live" as const,

  /** ElevenLabs TTS model. */
  ugc_tts_model: "eleven_multilingual_v2" as const,

  /** Default voice ID (used as fallback). */
  ugc_tts_voice_default: "bella" as const,
};
