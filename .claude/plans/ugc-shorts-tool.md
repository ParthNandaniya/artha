# UGC Shorts Video Generator — Implementation Plan

## Overview
AI-powered UGC short video tool. User writes a script, picks an avatar (preset or uploads their own face), and gets a 9:16 talking-head video with animated TikTok-style captions. Lives at `/tools/ugc-shorts` with its own standalone UI (not Artha's design system). Also available from the dashboard at 2.5 credits/video.

## New Dependencies
```
replicate          — SadTalker lip-sync model
elevenlabs         — TTS (script → voice)
```
Deepgram is NOT needed — ElevenLabs returns audio, and we can get word-level timestamps from ElevenLabs' `with_timestamps` option or by using Replicate's Whisper model.

## New Env Vars
```
REPLICATE_API_TOKEN=       # SadTalker + face enhancement + Whisper
ELEVENLABS_API_KEY=        # TTS voices
```

## Architecture / Flow

```
1. User writes script + selects avatar (preset or upload)
2. If uploaded face → enhance with GFPGAN/CodeFormer via Replicate
3. Script → ElevenLabs TTS → audio MP3 + word timestamps
4. Avatar image + audio → SadTalker (Replicate) → talking head video
5. Word timestamps → burn captions onto video (FFmpeg on server)
6. Upload final MP4 to R2 → return download URL
```

## Files to Create

### 1. API Layer

**`src/lib/ugc-shorts/`** — core business logic:
- `tts.ts` — ElevenLabs wrapper: voices list, generate speech, get timestamps
- `lip-sync.ts` — Replicate SadTalker: submit image+audio, poll for result
- `face-enhance.ts` — Replicate GFPGAN/CodeFormer: enhance uploaded face
- `captions.ts` — Generate ASS/SRT subtitles from word timestamps
- `compose.ts` — FFmpeg: burn captions onto talking-head video, output 9:16 MP4
- `pipeline.ts` — Orchestrator: runs full flow (TTS → lip-sync → captions → compose → R2)
- `voices.ts` — Preset voice configs (name, ElevenLabs voice_id, gender, style description)
- `avatars.ts` — Preset avatar configs (name, image R2 key, gender, description)

**`src/app/api/tools/ugc-shorts/`**:
- `route.ts` — POST: create a video job (free tool, rate-limited 2/day)
- `status/route.ts` — GET: poll job status by jobId
- `voices/route.ts` — GET: list available voices
- `avatars/route.ts` — GET: list available preset avatars
- `upload-face/route.ts` — POST: upload custom face image → R2, return enhanced version

**`src/app/api/dashboard/ugc-shorts/`**:
- `route.ts` — POST: create video (dashboard version, deducts 2.5 credits)

### 2. Frontend — Standalone Tool Page

**`src/app/tools/ugc-shorts/`**:
- `page.tsx` — server component: metadata + SEO
- `layout.tsx` — **custom layout** (overrides parent tools layout): dark/gradient theme, no Artha nav. Standalone branding.
- `client.tsx` — main client component with its own UI:

**UI Flow (standalone feel, dark themed, modern):**
```
Step 1: Write Script
  - Big textarea, character count, AI script helper button (optional)

Step 2: Choose Voice
  - Grid of voice cards with audio preview (play button)
  - Male/Female filter tabs
  - Labels: "Energetic Creator", "Calm Narrator", "Professional", etc.

Step 3: Choose Avatar
  - Grid of avatar cards (photo + name)
  - "Upload Your Face" card → file picker → shows enhanced preview
  - Male/Female filter tabs

Step 4: Generate
  - Big "Create Video" button
  - Progress steps animation (Generating voice → Animating face → Adding captions → Finalizing)
  - Video player preview when done
  - Download button
```

### 3. Dashboard Integration

**`src/components/panels/ugc-shorts-panel.tsx`**:
- Same flow as free tool but uses dashboard API (deducts 2.5 credits)
- Shows credit cost before generating
- History of past generated videos

### 4. Database

Add to `schema/platform.sql`:
```sql
CREATE TABLE IF NOT EXISTS ugc_video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),         -- NULL for free tool
  project_id UUID REFERENCES projects(id),   -- NULL for free tool
  ip_address TEXT,                            -- for free tool rate limiting

  -- Input
  script TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  avatar_type TEXT NOT NULL,                  -- 'preset' or 'custom'
  avatar_key TEXT NOT NULL,                   -- R2 key (preset image or uploaded face)

  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending',     -- pending|tts|lip_sync|composing|done|failed
  tts_audio_key TEXT,                         -- R2 key for generated audio
  raw_video_key TEXT,                         -- R2 key for SadTalker output
  final_video_key TEXT,                       -- R2 key for final captioned video
  word_timestamps JSONB,                      -- [{word, start, end}, ...]

  -- Output
  video_url TEXT,
  duration_seconds NUMERIC(6,2),

  -- Meta
  error TEXT,
  credits_charged NUMERIC(4,1) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 5. Preset Assets

**Avatars** (AI-generated faces, stored in R2):
- `ugc-avatars/male-1.png` — Young professional male
- `ugc-avatars/male-2.png` — Casual creator male
- `ugc-avatars/female-1.png` — Young professional female
- `ugc-avatars/female-2.png` — Casual creator female
- `ugc-avatars/male-3.png` — Older authoritative male
- `ugc-avatars/female-3.png` — Older authoritative female

**Voices** (ElevenLabs preset voice IDs):
- 3-4 male voices (energetic, calm, professional)
- 3-4 female voices (energetic, calm, professional)

## Rate Limiting
- Free tool: **2 videos/day** per IP (matches existing pattern in `free-tools.ts`)
- Dashboard: **2.5 credits** per video (uses `decrementProjectCredits`)

## Implementation Order
1. Install deps (`replicate`, `elevenlabs`) + add env vars
2. `src/lib/ugc-shorts/` — core pipeline (tts → lip-sync → captions → compose)
3. Database migration (ugc_video_jobs table)
4. API routes (free tool + dashboard)
5. Frontend — standalone tool page with custom dark UI
6. Dashboard panel integration
7. Generate/upload preset avatar images
8. Test end-to-end
