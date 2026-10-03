# UGC Shorts Video Generator

AI-powered UGC (User Generated Content) short video tool. Users write a script, pick a voice and avatar, and get a professional talking-head video with captions — ready for TikTok, Reels, or YouTube Shorts.

## Architecture Overview

```mermaid
graph TB
    subgraph "User Input"
        A[Write Script] --> D[Submit]
        B[Select Voice] --> D
        C[Select Avatar] --> D
    end

    subgraph "Generation Pipeline"
        D --> E[ElevenLabs TTS]
        E -->|Audio MP3| F[Upload to R2]
        F -->|Public Audio URL| G[Replicate SadTalker]
        C -->|Avatar Image URL| G
        G -->|Talking Head Video| H[Final Video URL]
    end

    subgraph "Output"
        H --> I[Video Player Preview]
        I --> J[Download MP4]
    end
```

## Request Flow

```mermaid
sequenceDiagram
    participant U as User Browser
    participant API as /api/tools/shorts
    participant EL as ElevenLabs
    participant R2 as Cloudflare R2
    participant RP as Replicate

    U->>API: POST {script, voiceId, avatarId}
    API->>API: Rate limit check (2/day)
    API->>API: Validate inputs

    API->>EL: Generate speech (script + voiceId)
    EL-->>API: Audio buffer (MP3)

    API->>R2: Upload audio (ugc-temp/{jobId}.mp3)
    R2-->>API: Public audio URL

    API->>RP: SadTalker (avatar image + audio URL)
    Note over RP: ~60-120s processing
    RP-->>API: Video URL (MP4)

    API-->>U: {videoUrl, durationSeconds}
    U->>U: Play video in browser
```

## File Structure

```
src/
├── lib/ugc-shorts/
│   ├── index.ts          # Barrel re-exports
│   ├── voices.ts         # ElevenLabs voice presets (6 voices)
│   ├── avatars.ts        # Avatar presets (6 avatars) + getAvatarUrl()
│   ├── tts.ts            # ElevenLabs TTS wrapper
│   ├── lip-sync.ts       # Replicate SadTalker wrapper
│   ├── captions.ts       # Word-level timestamps + ASS subtitle generation
│   └── pipeline.ts       # Orchestrator: TTS → R2 → SadTalker → result
│
├── app/api/tools/shorts/
│   ├── route.ts           # POST — main generation endpoint (300s timeout)
│   ├── voices/route.ts    # GET — list available voices
│   └── avatars/route.ts   # GET — list available avatars (with resolved URLs)
│
└── app/tools/shorts/
    ├── layout.tsx         # Custom dark-themed layout (standalone feel)
    ├── page.tsx           # Server component with SEO metadata
    └── client.tsx         # Multi-step form UI (Script → Voice → Avatar → Generate)
```

## Pipeline Steps

```mermaid
flowchart LR
    A["1. TTS\n(ElevenLabs)"] -->|Audio Buffer| B["2. Upload\n(R2)"]
    B -->|Public URL| C["3. Lip Sync\n(SadTalker)"]
    C -->|Video URL| D["4. Return\nResult"]

    style A fill:#7c3aed,color:#fff
    style B fill:#f59e0b,color:#000
    style C fill:#10b981,color:#fff
    style D fill:#3b82f6,color:#fff
```

| Step | Service | Input | Output | Duration |
|------|---------|-------|--------|----------|
| 1. TTS | ElevenLabs | Script text + voice ID | MP3 audio buffer | ~5s |
| 2. Upload | Cloudflare R2 | Audio buffer | Public URL | ~1s |
| 3. Lip Sync | Replicate (SadTalker) | Avatar image URL + audio URL | MP4 video URL | ~60-120s |
| 4. Return | — | Video URL | API response | immediate |

## Voices

6 preset voices from ElevenLabs (3 male, 3 female):

| ID | Name | Gender | Style | ElevenLabs Voice ID |
|----|------|--------|-------|---------------------|
| adam | Adam | Male | Deep & Authoritative | pNInz6obpgDQGcFmaJgB |
| antoni | Antoni | Male | Calm & Warm | ErXwobaYiN019PkySvjV |
| arnold | Arnold | Male | Professional & Clear | VR6AewLTigWG4xSOukaG |
| bella | Bella | Female | Energetic Creator | EXAVITQu4vr4xnSDxMaL |
| rachel | Rachel | Female | Calm & Professional | 21m00Tcm4TlvDq8ikWAM |
| domi | Domi | Female | Confident & Bold | AZnzlk1XvdvUeBnXmlld |

## Avatars

6 preset AI-generated avatars (3 male, 3 female), stored in R2 at `ugc-avatars/`.

Users can also upload their own face photo (JPG/PNG). The uploaded image is stored in R2 at `ugc-temp/face-{uuid}.{ext}` and passed to SadTalker.

## Access Model

```mermaid
graph LR
    subgraph "Free Tool"
        A["/tools/shorts"] -->|2 videos/day per IP| B[Rate Limited]
    end

    subgraph "Dashboard"
        C["Dashboard Panel"] -->|2.5 credits per video| D[Credit Deduction]
    end
```

| Channel | Rate Limit | Cost |
|---------|-----------|------|
| Free tool (`/tools/shorts`) | 2 videos/day per IP | Free |
| Dashboard | Unlimited | 2.5 task credits |

## Environment Variables

| Variable | Service | Required |
|----------|---------|----------|
| `REPLICATE_API_TOKEN` | Replicate (SadTalker lip-sync) | Yes |
| `ELEVENLABS_API_KEY` | ElevenLabs (TTS) | Yes |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 (already configured) | Yes |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 (already configured) | Yes |

## Cost per Video

| Component | Cost |
|-----------|------|
| ElevenLabs TTS | ~$0.30/1k chars (free tier: 10k chars/mo) |
| Replicate SadTalker | ~$0.03-0.05/run |
| R2 Storage | Negligible (free tier) |
| **Total** | **~$0.05-0.10/video** |

## Database

Table `ugc_video_jobs` in platform DB tracks all generation jobs:

```sql
ugc_video_jobs
├── id (PK)
├── user_id              -- NULL for free tool
├── project_id           -- NULL for free tool
├── ip_address           -- rate limiting
├── script, voice_id, avatar_type, avatar_id, avatar_image_url
├── status               -- pending|tts|lip_sync|composing|done|failed
├── tts_audio_key, raw_video_url, final_video_key, final_video_url
├── duration_seconds, error, credits_charged
└── created_at, updated_at
```

## UI Design

The tool page has its own **dark-themed standalone layout** (`/tools/shorts/layout.tsx`) separate from Artha's normal white theme. The UI uses:

- Dark background (#0a0a0f)
- Violet/purple gradient accents
- Glassmorphism cards (backdrop-blur, semi-transparent borders)
- 4-step wizard: Script → Voice → Avatar → Generate

```mermaid
stateDiagram-v2
    [*] --> Script: Page load
    Script --> Voice: Next (min 10 chars)
    Voice --> Avatar: Next (voice selected)
    Avatar --> Generate: Next (avatar selected)
    Generate --> Generating: Click "Generate Video"
    Generating --> Result: Pipeline complete
    Result --> Script: "Create Another"
```

## Future Enhancements

- [ ] Caption burning with FFmpeg (ASS subtitles are generated but not yet composited)
- [ ] Voice preview audio clips on the voice selection step
- [ ] Face enhancement with GFPGAN/CodeFormer for uploaded photos
- [ ] Dashboard panel integration (2.5 credits/video)
- [ ] Video history and re-download
- [ ] Background music options
- [ ] Multiple caption styles (TikTok, Hormozi, subtitle)
