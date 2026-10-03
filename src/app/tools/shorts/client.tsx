"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Voice {
  id: string;
  name: string;
  gender: "male" | "female";
  style: string;
  previewUrl?: string;
}

interface Avatar {
  id: string;
  name: string;
  gender: "male" | "female";
  description: string;
  imageUrl?: string;
  thumbnailUrl?: string;
}

const EXAMPLE_PROMPTS = [
  {
    label: "Product Review",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
    text: "Excited product review for a new skincare serum that cleared dark spots",
  },
  {
    label: "App Promo",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
    text: "Promote a productivity app that plans your entire week in 60 seconds",
  },
  {
    label: "Course Ad",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
      </svg>
    ),
    text: "Free mini-course about growing from 0 to 50K followers in 3 months",
  },
];

// ---------------------------------------------------------------------------
// Animated background
// ---------------------------------------------------------------------------

function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full bg-violet-600/8 blur-[120px]"
        animate={{
          x: [0, 100, -50, 0],
          y: [0, -80, 60, 0],
          scale: [1, 1.2, 0.9, 1],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        style={{ top: "-10%", left: "-10%" }}
      />
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full bg-purple-600/6 blur-[100px]"
        animate={{
          x: [0, -120, 80, 0],
          y: [0, 100, -60, 0],
          scale: [1, 0.8, 1.1, 1],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        style={{ bottom: "-5%", right: "-5%" }}
      />
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full bg-indigo-500/5 blur-[80px]"
        animate={{
          x: [0, 60, -40, 0],
          y: [0, -40, 80, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        style={{ top: "40%", left: "50%" }}
      />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Glass card
// ---------------------------------------------------------------------------

function GlassCard({
  children,
  className = "",
  selected = false,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={onClick ? { scale: 1.02, y: -2 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={`relative rounded-2xl border backdrop-blur-sm transition-colors duration-300 ${
        selected
          ? "border-violet-500/60 bg-violet-500/10"
          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {selected && (
        <motion.div
          className="absolute -inset-px rounded-2xl pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            background:
              "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(168,85,247,0.2), rgba(99,102,241,0.3))",
          }}
        />
      )}
      {selected && (
        <motion.div
          className="absolute -inset-1 rounded-2xl pointer-events-none blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.4), transparent 70%)" }}
        />
      )}
      <div className="relative">{children}</div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({
  number,
  title,
  subtitle,
}: {
  number: number;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-xs font-semibold text-white shrink-0 mt-0.5">
        {number}
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white/90">{title}</h2>
        <p className="text-sm text-white/40">{subtitle}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generation progress
// ---------------------------------------------------------------------------

const PROGRESS_STEPS = [
  { label: "Generating voice audio...", icon: "🎙️" },
  { label: "Creating video...", icon: "🎬" },
  { label: "Processing & uploading...", icon: "📤" },
  { label: "Finalizing...", icon: "✨" },
];

function GenerationProgress({ stepIndex }: { stepIndex: number }) {
  const progress = Math.min((stepIndex / PROGRESS_STEPS.length) * 100, 100);

  return (
    <div className="space-y-4 my-6">
      <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: "linear-gradient(90deg, #8b5cf6, #a855f7, #6366f1, #8b5cf6)",
            backgroundSize: "200% 100%",
          }}
          animate={{
            width: `${progress}%`,
            backgroundPosition: ["0% 0%", "200% 0%"],
          }}
          transition={{
            width: { duration: 0.8, ease: "easeOut" },
            backgroundPosition: { duration: 2, repeat: Infinity, ease: "linear" },
          }}
        />
      </div>

      <div className="space-y-2">
        {PROGRESS_STEPS.map(({ label, icon }, i) => {
          const isDone = i < stepIndex;
          const isActive = i === stepIndex;
          return (
            <motion.div
              key={label}
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-500 ${
                  isDone
                    ? "bg-green-500/20 border border-green-500/30"
                    : isActive
                      ? "bg-violet-500/20 border border-violet-500/40"
                      : "bg-white/5 border border-white/10"
                }`}
              >
                {isDone ? (
                  <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : isActive ? (
                  <motion.div
                    className="w-2 h-2 rounded-full bg-violet-400"
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                ) : (
                  <span className="text-[10px]">{icon}</span>
                )}
              </div>
              <span
                className={`text-sm transition-all duration-300 ${
                  isDone
                    ? "text-green-400/60 line-through"
                    : isActive
                      ? "text-white font-medium"
                      : "text-white/20"
                }`}
              >
                {label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Celebration burst
// ---------------------------------------------------------------------------

function CelebrationBurst() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    angle: (i / 30) * 360,
    distance: 60 + Math.random() * 120,
    size: Math.random() * 6 + 3,
    color: ["#8b5cf6", "#a855f7", "#6366f1", "#22c55e", "#f59e0b", "#ec4899"][i % 6],
    delay: Math.random() * 0.3,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
            y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
            opacity: 0,
            scale: 0,
          }}
          transition={{ duration: 1.2, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component — 2-phase layout
// ---------------------------------------------------------------------------

export function UgcShortsClient() {
  const [isDevMode, setIsDevMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsDevMode(params.get("dev") === "1" || process.env.NODE_ENV === "development");
  }, []);

  // Phase: "prompt" → "edit" → "generate"
  const [phase, setPhase] = useState<"prompt" | "edit" | "generate">("prompt");

  // Prompt (phase 1)
  const [prompt, setPrompt] = useState("");
  const [generatingScript, setGeneratingScript] = useState(false);

  // Script + video prompt (phase 2 — editable)
  const [script, setScript] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const scriptValid = script.trim().length >= 10 && script.length <= 1000;

  // Voice
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);

  // Avatar
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [useUpload, setUseUpload] = useState(false);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  // Dev mode
  const [skipTts, setSkipTts] = useState(false);

  // Voice preview
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Fetch voices and avatars on mount
  useEffect(() => {
    setVoicesLoading(true);
    fetch("/api/tools/shorts/voices")
      .then((r) => r.json())
      .then((d) => setVoices(d.voices ?? d))
      .catch(() => setVoices([]))
      .finally(() => setVoicesLoading(false));

    setAvatarsLoading(true);
    fetch("/api/tools/shorts/avatars")
      .then((r) => r.json())
      .then((d) => setAvatars(d.avatars ?? d))
      .catch(() => setAvatars([]))
      .finally(() => setAvatarsLoading(false));
  }, []);

  // Auto-filter avatars to match selected voice gender
  const selectedVoiceObj = voices.find((v) => v.id === selectedVoice);
  const selectedVoiceGender = selectedVoiceObj?.gender;
  const filteredAvatars = selectedVoiceGender
    ? avatars.filter((a) => a.gender === selectedVoiceGender)
    : avatars;
  const selectedAvatarObj = avatars.find((a) => a.id === selectedAvatar);

  // Clear avatar selection if it doesn't match voice gender
  useEffect(() => {
    if (selectedVoiceGender && selectedAvatarObj && selectedAvatarObj.gender !== selectedVoiceGender) {
      setSelectedAvatar(null);
      setUseUpload(false);
    }
  }, [selectedVoiceGender, selectedAvatarObj]);

  // Simulate generation progress
  useEffect(() => {
    if (!generating) return;
    if (genStep >= PROGRESS_STEPS.length) return;
    const t = setTimeout(() => setGenStep((s) => s + 1), 2000 + Math.random() * 1500);
    return () => clearTimeout(t);
  }, [generating, genStep]);

  const canGenerate =
    scriptValid &&
    videoPrompt.trim().length >= 5 &&
    selectedVoice &&
    (selectedAvatar || (useUpload && uploadedFile));

  // Phase 1: Generate script from prompt
  const handleGenerateScript = useCallback(async () => {
    setGeneratingScript(true);
    setError(null);

    try {
      const res = await fetch("/api/tools/shorts/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error ?? "Failed to generate script.");
        setGeneratingScript(false);
        return;
      }

      setScript(data.script);
      setVideoPrompt(data.videoPrompt);
      setPhase("edit");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGeneratingScript(false);
    }
  }, [prompt]);

  // Phase 3: Generate video
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenStep(0);
    setError(null);
    setVideoUrl(null);
    setAudioUrl(null);
    setLimitReached(false);
    setShowCelebration(false);

    try {
      let res: Response;

      if (useUpload && uploadedFile) {
        const formData = new FormData();
        formData.append("script", script);
        formData.append("voiceId", selectedVoice!);
        formData.append("videoPrompt", videoPrompt);
        formData.append("avatarFile", uploadedFile);
        if (skipTts) formData.append("skipTts", "true");
        res = await fetch("/api/tools/shorts", { method: "POST", body: formData });
      } else {
        res = await fetch("/api/tools/shorts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script,
            voiceId: selectedVoice,
            avatarId: selectedAvatar,
            videoPrompt,
            skipTts,
          }),
        });
      }

      const data = await res.json();

      if (res.status === 429) {
        setLimitReached(true);
        setError("Daily limit reached. Sign up for unlimited access.");
        setGenerating(false);
        return;
      }

      if (!data.success) {
        setError(data.error ?? "Something went wrong. Please try again.");
        if (data.limitReached) setLimitReached(true);
        setGenerating(false);
        return;
      }

      setGenStep(PROGRESS_STEPS.length);
      await new Promise((r) => setTimeout(r, 600));
      setVideoUrl(data.videoUrl);
      setAudioUrl(data.audioUrl);
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 2000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [script, videoPrompt, selectedVoice, selectedAvatar, useUpload, uploadedFile, skipTts]);

  const reset = () => {
    setPrompt("");
    setScript("");
    setVideoPrompt("");
    setSelectedVoice(null);
    setSelectedAvatar(null);
    setUploadedFile(null);
    setUseUpload(false);
    setVideoUrl(null);
    setAudioUrl(null);
    setError(null);
    setLimitReached(false);
    setGenStep(0);
    setShowCelebration(false);
    setPhase("prompt");
  };

  const playPreview = useCallback(
    (voiceId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedVoice(voiceId);

      if (playingVoice === voiceId) {
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
        audioRef.current = null;
        setPlayingVoice(null);
        return;
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }

      const cached = audioCache.current.get(voiceId);
      if (cached) {
        cached.currentTime = 0;
        audioRef.current = cached;
        setPlayingVoice(voiceId);
        const onEnded = () => {
          setPlayingVoice(null);
          audioRef.current = null;
        };
        cached.addEventListener("ended", onEnded, { once: true });
        cached.play().catch(() => setPlayingVoice(null));
        return;
      }

      setLoadingVoice(voiceId);
      const audio = new Audio(`/api/tools/shorts/voices/preview?voiceId=${voiceId}`);
      audioRef.current = audio;

      audio.addEventListener(
        "canplaythrough",
        () => {
          setLoadingVoice(null);
          setPlayingVoice(voiceId);
          audioCache.current.set(voiceId, audio);
          audio.play().catch(() => setPlayingVoice(null));
        },
        { once: true }
      );

      audio.addEventListener(
        "ended",
        () => {
          setPlayingVoice(null);
          audioRef.current = null;
        },
        { once: true }
      );

      audio.addEventListener(
        "error",
        () => {
          setLoadingVoice(null);
          setPlayingVoice(null);
          audioRef.current = null;
        },
        { once: true }
      );

      audio.load();
    },
    [playingVoice]
  );

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // ---- Render: Generating / Video ready ----

  if (generating || videoUrl) {
    return (
      <div className="max-w-4xl mx-auto w-full px-6 py-12 relative">
        <AnimatedBackground />

        {generating && !videoUrl && (
          <motion.div
            className="text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <GlassCard className="p-8 max-w-md mx-auto">
              <div className="relative w-16 h-16 mx-auto mb-5">
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-violet-500/20"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-1 rounded-full border-2 border-transparent border-t-violet-400 border-r-purple-400"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-3 rounded-full border-2 border-transparent border-b-indigo-400"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-500 to-purple-500" />
                </motion.div>
              </div>

              <h3 className="text-lg font-semibold text-white/90 mb-1">Creating your video</h3>
              <p className="text-sm text-white/40 mb-4">This usually takes 1-2 minutes</p>
              <GenerationProgress stepIndex={genStep} />
            </GlassCard>
          </motion.div>
        )}

        {videoUrl && (
          <motion.div
            className="text-center space-y-6 relative"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            {showCelebration && <CelebrationBurst />}

            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <motion.svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.3 }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </motion.svg>
              Video ready
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <GlassCard className="p-2 max-w-sm mx-auto">
                <video
                  src={videoUrl}
                  controls
                  className="w-full rounded-xl aspect-[9/16] bg-black"
                  playsInline
                />
              </GlassCard>
              {audioUrl && (
                <div className="mt-4">
                  <p className="text-xs text-white/40 mb-2">Audio track (plays separately)</p>
                  <audio src={audioUrl} controls className="mx-auto" />
                </div>
              )}
            </motion.div>

            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <motion.a
                href={videoUrl}
                download
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-lg shadow-violet-600/20 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                </svg>
                Download
              </motion.a>
              <motion.button
                onClick={reset}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                className="px-6 py-2.5 rounded-xl font-medium text-white/60 border border-white/10 hover:border-white/20 hover:text-white/80 transition-all"
              >
                Create Another
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </div>
    );
  }

  // ---- Render: Main form ----

  return (
    <div className="max-w-4xl mx-auto w-full px-6 py-12 relative">
      <AnimatedBackground />

      {/* ---- Header ---- */}
      <motion.div
        className="text-center mb-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-600/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-5"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <motion.span
            className="w-1.5 h-1.5 rounded-full bg-violet-400"
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          Free to use &mdash; no signup required
        </motion.div>

        <motion.h1
          className="text-4xl sm:text-5xl font-bold mb-4"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <span className="bg-gradient-to-r from-white via-violet-200 to-purple-400 bg-clip-text text-transparent">
            AI UGC Video Generator
          </span>
        </motion.h1>
        <motion.p
          className="text-white/50 text-lg max-w-xl mx-auto leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Describe your idea, we&apos;ll write the script, then generate a professional UGC&nbsp;short
          with voice and video.
        </motion.p>
      </motion.div>

      {/* ---- Dev mode banner ---- */}
      {isDevMode && (
        <motion.div
          className="mb-6 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className="text-xs font-mono text-amber-400">DEV MODE</span>
          <label className="flex items-center gap-2 cursor-pointer ml-auto">
            <span className="text-xs text-white/50">Skip TTS (use cached audio)</span>
            <input
              type="checkbox"
              checked={skipTts}
              onChange={(e) => setSkipTts(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/30"
            />
          </label>
        </motion.div>
      )}

      <div className="space-y-10">
        {/* ---- Phase 1: Prompt ---- */}
        {phase === "prompt" && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <SectionHeader
              number={1}
              title="Describe your video idea"
              subtitle="We'll generate an optimized script for you"
            />

            <GlassCard className="p-5">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="e.g. Excited review of a new AI productivity app that plans your week..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 resize-none transition-all text-sm leading-relaxed"
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs ${prompt.length > 0 && prompt.trim().length < 3 ? "text-red-400" : "text-white/30"}`}>
                  {prompt.trim().length < 3 && prompt.length > 0 ? "Minimum 3 characters" : "\u00A0"}
                </span>
                <span className={`text-xs tabular-nums ${prompt.length > 450 ? "text-amber-400" : "text-white/30"}`}>
                  {prompt.length}/500
                </span>
              </div>
            </GlassCard>

            {/* Example prompts */}
            <div className="mt-3">
              <p className="text-xs text-white/30 mb-2">Try an example:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => setPrompt(ex.text)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20 transition-colors text-xs text-white/50 hover:text-white/70"
                  >
                    <span className="text-violet-400">{ex.icon}</span>
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Script button */}
            <motion.div className="flex justify-center pt-6">
              <motion.button
                onClick={handleGenerateScript}
                disabled={prompt.trim().length < 3 || generatingScript}
                whileHover={prompt.trim().length >= 3 ? { scale: 1.04, y: -2 } : undefined}
                whileTap={prompt.trim().length >= 3 ? { scale: 0.97 } : undefined}
                className="relative w-full sm:w-auto px-10 py-3 rounded-xl font-semibold text-white overflow-hidden disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(135deg, #7c3aed, #8b5cf6, #6366f1, #7c3aed)",
                    backgroundSize: "300% 300%",
                  }}
                  animate={{ backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {generatingScript ? (
                    <>
                      <motion.div
                        className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      />
                      Writing script...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                      </svg>
                      Generate Script
                    </>
                  )}
                </span>
              </motion.button>
            </motion.div>
          </motion.section>
        )}

        {/* ---- Phase 2: Edit script + pick voice/avatar ---- */}
        {phase === "edit" && (
          <>
            {/* Script editor */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <SectionHeader number={1} title="Edit your script" subtitle="The spoken words for your video" />

              <GlassCard className="p-5">
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value.slice(0, 1000))}
                  rows={5}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 resize-none transition-all text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs ${script.length > 0 && script.trim().length < 10 ? "text-red-400" : "text-white/30"}`}>
                    {script.trim().length < 10 && script.length > 0 ? "Minimum 10 characters" : "\u00A0"}
                  </span>
                  <span className={`text-xs tabular-nums ${script.length > 950 ? "text-amber-400" : "text-white/30"}`}>
                    {script.length}/1000
                  </span>
                </div>
              </GlassCard>
            </motion.section>

            {/* Video prompt editor */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <SectionHeader number={2} title="Video style prompt" subtitle="How the avatar should move and express" />

              <GlassCard className="p-5">
                <textarea
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value.slice(0, 500))}
                  rows={2}
                  placeholder="e.g. Talking to camera with excited expressions, casual indoor setting..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 resize-none transition-all text-sm leading-relaxed"
                />
                <div className="flex justify-end mt-1">
                  <span className={`text-xs tabular-nums ${videoPrompt.length > 450 ? "text-amber-400" : "text-white/30"}`}>
                    {videoPrompt.length}/500
                  </span>
                </div>
              </GlassCard>
            </motion.section>

            {/* Voice picker */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <SectionHeader number={3} title="Pick a voice" subtitle="Select the voice for your avatar" />

              {voicesLoading ? (
                <div className="flex items-center justify-center py-10">
                  <motion.div
                    className="w-8 h-8 rounded-full border-2 border-violet-500/30"
                    style={{ borderTopColor: "rgb(139,92,246)" }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {voices.map((v) => {
                    const isPlaying = playingVoice === v.id;
                    const isLoading = loadingVoice === v.id;
                    return (
                      <GlassCard
                        key={v.id}
                        selected={selectedVoice === v.id}
                        onClick={() => setSelectedVoice(v.id)}
                        className="p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
                              v.gender === "female"
                                ? "bg-pink-500/15 text-pink-400"
                                : "bg-blue-500/15 text-blue-400"
                            }`}
                          >
                            {v.gender === "female" ? (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <circle cx="12" cy="8" r="5" />
                                <path d="M12 13v8M9 18h6" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <circle cx="10" cy="14" r="5" />
                                <path d="M19 5l-4.5 4.5M19 5h-5M19 5v5" />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white/90 truncate">{v.name}</p>
                            <p className="text-xs text-white/40 truncate">{v.style}</p>
                          </div>
                          <motion.button
                            onClick={(e) => playPreview(v.id, e)}
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.9 }}
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${
                              isPlaying
                                ? "bg-violet-500 text-white shadow-md shadow-violet-500/30"
                                : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70"
                            }`}
                            title={isPlaying ? "Stop preview" : "Play preview"}
                          >
                            {isLoading ? (
                              <motion.div
                                className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                              />
                            ) : isPlaying ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </motion.button>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </motion.section>

            {/* Avatar picker */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <SectionHeader
                number={4}
                title="Choose an avatar"
                subtitle={
                  selectedVoiceGender
                    ? `Showing ${selectedVoiceGender} avatars to match your voice`
                    : "Pick who will present your script"
                }
              />

              {avatarsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <motion.div
                    className="w-8 h-8 rounded-full border-2 border-violet-500/30"
                    style={{ borderTopColor: "rgb(139,92,246)" }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {/* Upload card */}
                  <GlassCard
                    selected={useUpload}
                    onClick={() => {
                      setUseUpload(true);
                      setSelectedAvatar(null);
                    }}
                    className="overflow-hidden"
                  >
                    <div className="aspect-[3/4] flex flex-col items-center justify-center text-center gap-2 bg-gradient-to-b from-violet-600/5 to-purple-600/10">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600/20 to-purple-600/20 border-2 border-dashed border-violet-500/30 flex items-center justify-center">
                        <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white/80">Your Face</p>
                        <p className="text-[10px] text-white/30 mt-0.5">
                          {uploadedFile ? uploadedFile.name : "JPG / PNG"}
                        </p>
                      </div>
                      {useUpload && (
                        <label className="text-[10px] text-violet-400 hover:text-violet-300 cursor-pointer underline underline-offset-2">
                          {uploadedFile ? "Change" : "Choose file"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) setUploadedFile(f);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </GlassCard>

                  {filteredAvatars.map((a) => (
                    <GlassCard
                      key={a.id}
                      selected={!useUpload && selectedAvatar === a.id}
                      onClick={() => {
                        setSelectedAvatar(a.id);
                        setUseUpload(false);
                      }}
                      className="overflow-hidden group"
                    >
                      <div className="aspect-[3/4] relative overflow-hidden bg-white/5">
                        {(a.thumbnailUrl || a.imageUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.thumbnailUrl || a.imageUrl}
                            alt={a.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div
                            className={`w-full h-full flex items-center justify-center ${
                              a.gender === "female" ? "bg-pink-500/10" : "bg-blue-500/10"
                            }`}
                          >
                            <svg className="w-10 h-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                            </svg>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                        <div className="absolute bottom-0 inset-x-0 p-2">
                          <p className="text-xs font-semibold text-white drop-shadow-lg">{a.name}</p>
                          <p className="text-[10px] text-white/60 truncate drop-shadow">{a.description}</p>
                        </div>
                        {!useUpload && selectedAvatar === a.id && (
                          <motion.div
                            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center shadow-lg"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 400, damping: 15 }}
                          >
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </motion.div>
                        )}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </motion.section>

            {/* ---- Error ---- */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`text-center text-sm px-4 py-3 rounded-xl border ${
                    limitReached
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                      : "bg-red-500/10 border-red-500/20 text-red-400"
                  }`}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ---- Action buttons ---- */}
            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 pb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <motion.button
                onClick={() => setPhase("prompt")}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="px-6 py-3 rounded-xl font-medium text-white/50 border border-white/10 hover:border-white/20 hover:text-white/70 transition-all"
              >
                Back
              </motion.button>

              <motion.button
                onClick={handleGenerate}
                disabled={!canGenerate}
                whileHover={canGenerate ? { scale: 1.04, y: -2 } : undefined}
                whileTap={canGenerate ? { scale: 0.97 } : undefined}
                className="relative w-full sm:w-auto px-12 py-3.5 rounded-xl font-semibold text-white overflow-hidden disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(135deg, #7c3aed, #8b5cf6, #6366f1, #7c3aed)",
                    backgroundSize: "300% 300%",
                  }}
                  animate={{ backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
                    backgroundSize: "200% 100%",
                  }}
                  animate={{ backgroundPosition: ["-100% 0%", "200% 0%"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
                />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                  </svg>
                  Generate Video
                </span>
              </motion.button>
            </motion.div>
          </>
        )}

        {/* ---- Error (prompt phase) ---- */}
        {phase === "prompt" && (
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center text-sm px-4 py-3 rounded-xl border bg-red-500/10 border-red-500/20 text-red-400"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
