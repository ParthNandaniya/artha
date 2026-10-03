"use client";

import { createContext, useContext, useCallback, useState, useEffect, useRef } from "react";
import type { Project, SubscriptionStatus } from "@/lib/types";
import { CreditPurchaseModal } from "@/components/modals/credit-purchase-modal";
import { ENHANCE_COST } from "@/config/credit-costs";

interface SubscriptionContextValue {
  credits: number;
  subscriptionStatus: SubscriptionStatus;
  hasCredits: boolean;
  projectId: string | null;
  projectName: string;
  openCreditModal: () => void;
  /** Check credits and open modal if insufficient. Returns true if credits are available. */
  requireCredits: () => boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  credits: 0,
  subscriptionStatus: "none",
  hasCredits: false,
  projectId: null,
  projectName: "",
  openCreditModal: () => {},
  requireCredits: () => false,
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

interface SubscriptionProviderProps {
  project: Project | null;
  onSubscribe: () => void;
  onBuyPack: () => void;
  checkoutLoading: boolean;
  /** External trigger to open the credit modal (e.g. from search params) */
  externalOpen?: boolean;
  onExternalOpenHandled?: () => void;
  children: React.ReactNode;
}

export function SubscriptionProvider({
  project,
  onSubscribe,
  onBuyPack,
  checkoutLoading,
  externalOpen,
  onExternalOpenHandled,
  children,
}: SubscriptionProviderProps) {
  const [showCreditModal, setShowCreditModal] = useState(false);
  const handledRef = useRef(false);

  const rawCredits = project?.task_credits;
  const credits = rawCredits != null && Number.isFinite(Number(rawCredits)) ? Number(rawCredits) : 0;
  const subscriptionStatus = project?.subscription_status ?? "none";
  const hasCredits = credits >= ENHANCE_COST;

  // Handle external open trigger
  useEffect(() => {
    if (externalOpen && !handledRef.current) {
      handledRef.current = true;
      setShowCreditModal(true);
      onExternalOpenHandled?.();
    }
    if (!externalOpen) {
      handledRef.current = false;
    }
  }, [externalOpen, onExternalOpenHandled]);

  const openCreditModal = useCallback(() => {
    setShowCreditModal(true);
  }, []);

  const requireCredits = useCallback(() => {
    if (credits >= ENHANCE_COST) return true;
    setShowCreditModal(true);
    return false;
  }, [credits]);

  return (
    <SubscriptionContext.Provider
      value={{
        credits,
        subscriptionStatus,
        hasCredits,
        projectId: project?.id ?? null,
        projectName: project?.name ?? "",
        openCreditModal,
        requireCredits,
      }}
    >
      {children}
      <CreditPurchaseModal
        isOpen={showCreditModal}
        onClose={() => setShowCreditModal(false)}
        onSubscribe={onSubscribe}
        onBuyPack={onBuyPack}
        loading={checkoutLoading}
        hasSubscription={subscriptionStatus === "active"}
        projectName={project?.name ?? ""}
      />
    </SubscriptionContext.Provider>
  );
}
