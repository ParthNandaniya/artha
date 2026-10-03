import type { Metadata } from "next";
import { WaitlistHero } from "@/components/landing/waitlist-hero";

export const metadata: Metadata = {
  title: "Artha - Waitlist",
  description: "Join the waitlist for Artha, AI Agents running your company, 24/7.",
};

export default function WaitlistPage() {
  return <WaitlistHero />;
}
