"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WaitlistHero() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setStatus("idle");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: "waitlist_page",
        }),
      });

      const data = await readJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.error || "Could not join the waitlist");
      }

      setStatus("success");
      setMessage(data?.message || "You're on the waitlist. We'll email you as soon as Artha is ready.");
      setEmail("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not join the waitlist");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fcf6eb] px-6 py-10 text-slate-950">
      <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white px-8 py-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-600">
          Artha
        </p>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
          Idea to live business in 3 minutes.
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
          Join the waitlist to get early access when Artha opens.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="h-12 border-slate-300 bg-white text-base text-slate-950"
            maxLength={320}
            required
          />
          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="h-12 rounded-xl bg-slate-950 px-6 text-base font-semibold text-white hover:bg-slate-800"
          >
            {loading ? "Joining..." : "Join waitlist"}
          </Button>
        </form>

        <p
          className={`mt-4 min-h-6 text-sm ${
            status === "success"
              ? "text-emerald-600"
              : status === "error"
                ? "text-red-600"
                : "text-slate-600"
          }`}
          aria-live="polite"
        >
          {message || "We'll email you when the beta is ready."}
        </p>
      </div>
    </main>
  );
}

async function readJsonSafely(response: Response): Promise<{ error?: string; message?: string } | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as { error?: string; message?: string };
  } catch {
    return null;
  }
}
