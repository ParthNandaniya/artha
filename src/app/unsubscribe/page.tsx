"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const type = searchParams.get("type") || "all";

  const [status, setStatus] = useState<"loading" | "success" | "error" | "resubscribed">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid unsubscribe link.");
      return;
    }

    fetch("/api/email/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, type }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatus("success");
          setMessage(data.message);
        } else {
          setStatus("error");
          setMessage(data.error || "Something went wrong.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      });
  }, [token, type]);

  const handleResubscribe = () => {
    fetch("/api/email/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, type, action: "resubscribe" }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setStatus("resubscribed");
      });
  };

  const typeLabels: Record<string, string> = {
    all: "all emails",
    digest: "daily digest emails",
    nudge: "site activity nudge emails",
    marketing: "marketing emails",
    weekly_summary: "weekly summary emails",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#F4F7F9", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ maxWidth: 480, width: "100%", padding: 40, backgroundColor: "#fff", borderRadius: 12, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>
          {status === "loading" && "Processing..."}
          {status === "success" && "Unsubscribed"}
          {status === "resubscribed" && "Resubscribed"}
          {status === "error" && "Oops"}
        </h1>
        <p style={{ fontSize: 16, color: "#64748B", lineHeight: 1.6, marginBottom: 24 }}>
          {status === "loading" && "Please wait while we process your request."}
          {status === "success" && `You've been unsubscribed from ${typeLabels[type] || type}. You won't receive these emails anymore.`}
          {status === "resubscribed" && `You've been resubscribed to ${typeLabels[type] || type}. Welcome back!`}
          {status === "error" && message}
        </p>
        {status === "success" && (
          <button
            onClick={handleResubscribe}
            style={{ padding: "10px 24px", backgroundColor: "#0F172A", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Undo — Resubscribe
          </button>
        )}
        <p style={{ marginTop: 24, fontSize: 13, color: "#94A3B8" }}>
          <a href="https://artha.run" style={{ color: "#64748B", textDecoration: "none" }}>Back to Artha</a>
        </p>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p>Loading...</p>
      </div>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}
