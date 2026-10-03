"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRevenue, useWithdrawRevenue, useSetupStripeConnect, useSubscribers } from "@/hooks/use-revenue";

interface RevenuePanelProps {
  project: Project;
  onSubscribe?: () => void;
  checkoutLoading?: boolean;
}

export function RevenuePanel({ project, onSubscribe, checkoutLoading }: RevenuePanelProps) {
  const { data: transactions = [] } = useRevenue(project.id);
  const { data: subscriberData } = useSubscribers(project.id);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawMethod, setWithdrawMethod] = useState<"stripe_bank" | "paypal">("stripe_bank");
  const [paypalEmail, setPaypalEmail] = useState(() => {
    const lastPaypal = transactions.find(
      (tx) => tx.external_payout_method === "paypal" && tx.external_payout_email
    )?.external_payout_email;
    return lastPaypal || "";
  });
  const [withdrawing, setWithdrawing] = useState(false);
  const [connectSetup, setConnectSetup] = useState(false);

  const { mutateAsync: withdrawRevenue } = useWithdrawRevenue(project.id);
  const { mutateAsync: setupStripeConnect } = useSetupStripeConnect(project.id);

  const isSubscribed = project.subscription_status === "active";

  async function handleWithdraw() {
    const cents = Math.round(parseFloat(withdrawAmount) * 100);
    if (isNaN(cents) || cents <= 0 || cents > project.revenue_balance_cents) return;

    setWithdrawing(true);
    try {
      await withdrawRevenue({
        amountCents: cents,
        method: withdrawMethod,
        paypalEmail: withdrawMethod === "paypal" ? paypalEmail : undefined,
      });
      setWithdrawAmount("");
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to withdraw");
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleConnectSetup() {
    setConnectSetup(true);
    try {
      const data = await setupStripeConnect();
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      alert(err.message || "Failed to setup connect");
    } finally {
      setConnectSetup(false);
    }
  }

  const incomeTransactions = transactions.filter((t) => t.type === "income");
  const totalGrossRevenue = incomeTransactions.reduce(
    (sum, tx) => sum + (tx.gross_amount_cents ?? tx.amount_cents),
    0
  );
  const totalNetRevenue = incomeTransactions.reduce(
    (sum, tx) => sum + (tx.seller_net_amount_cents ?? tx.amount_cents),
    0
  );
  const totalWithdrawn = transactions
    .filter((t) => t.type === "withdrawal" && t.status === "completed")
    .reduce((sum, t) => sum + t.amount_cents, 0);

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-6">
      <h2 className="text-lg font-semibold">Revenue</h2>

      {/* Subscription CTA for unsubscribed users */}
      {!isSubscribed && onSubscribe && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-base mb-1">Start Accepting Payments</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Subscribe to start taking payments from your users. Track revenue, and
                  withdraw your earnings — all managed automatically by your AI company.
                </p>
                <div className="flex items-center gap-3">
                  <Button onClick={onSubscribe} disabled={checkoutLoading} size="sm">
                    {checkoutLoading ? "Redirecting..." : "Subscribe — $49/mo"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Includes 35 task credits + nightly runs
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Gross Sales</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${(totalGrossRevenue / 100).toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Net Earnings</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${(totalNetRevenue / 100).toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Available Balance</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">${(project.revenue_balance_cents / 100).toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">MRR</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${((subscriberData?.summary.mrrCents ?? 0) / 100).toFixed(2)}</div>
            {subscriberData?.summary.activeCount != null && (
              <p className="text-xs text-muted-foreground mt-1">
                {subscriberData.summary.activeCount} active {subscriberData.summary.activeCount === 1 ? "customer" : "customers"}
                {subscriberData.summary.newLast7Days > 0 && (
                  <span className="text-emerald-600 ml-1">+{subscriberData.summary.newLast7Days} this week</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {subscriberData && subscriberData.subscribers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Customers</CardTitle>
              <div className="flex items-center gap-2">
                {subscriberData.summary.canceledCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {subscriberData.summary.canceledCount} canceled
                  </span>
                )}
                <Badge variant="default" className="text-xs">
                  {subscriberData.summary.activeCount} active
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {subscriberData.subscribers.map((sub, i) => {
                  const statusVariant: "default" | "secondary" | "destructive" =
                    sub.status === "active" || sub.status === "one_time"
                      ? "default"
                      : sub.status === "canceled"
                        ? "destructive"
                        : "secondary";
                  const statusLabel =
                    sub.status === "one_time" ? "paid" : sub.status;

                  return (
                    <div
                      key={`${sub.email}-${i}`}
                      className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-muted/50 border-b last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {sub.name || sub.email}
                          </p>
                          <Badge variant={statusVariant} className="text-[10px] shrink-0">
                            {statusLabel}
                          </Badge>
                        </div>
                        {sub.name && (
                          <p className="text-xs text-muted-foreground truncate">{sub.email}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {sub.plan_name || "Plan"}
                          {" \u2022 "}${(sub.amount_cents / 100).toFixed(2)}
                          {sub.billing_interval ? `/${sub.billing_interval}` : " one-time"}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(sub.subscribed_at).toLocaleDateString()}
                        </p>
                        {sub.current_period_end && sub.status === "active" && (
                          <p className="text-[10px] text-muted-foreground">
                            renews {new Date(sub.current_period_end).toLocaleDateString()}
                          </p>
                        )}
                        {sub.canceled_at && (
                          <p className="text-[10px] text-destructive">
                            canceled {new Date(sub.canceled_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            {subscriberData.summary.revenueLast7DaysCents > 0 && (
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                Last 7 days: ${(subscriberData.summary.revenueLast7DaysCents / 100).toFixed(2)} revenue
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Withdraw Funds</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={withdrawMethod === "stripe_bank" ? "default" : "outline"}
              size="sm"
              onClick={() => setWithdrawMethod("stripe_bank")}
            >
              Bank account (Stripe)
            </Button>
            <Button
              type="button"
              variant={withdrawMethod === "paypal" ? "default" : "outline"}
              size="sm"
              onClick={() => setWithdrawMethod("paypal")}
            >
              PayPal
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input type="number" step="0.01" min="0" max={(project.revenue_balance_cents / 100).toFixed(2)}
              value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="Amount in USD" className="w-full sm:max-w-[200px]" />
            <Button onClick={handleWithdraw} disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0} className="whitespace-nowrap">
              {withdrawing ? "Processing..." : withdrawMethod === "paypal" ? "Request PayPal payout" : "Withdraw to bank"}
            </Button>
          </div>
          {withdrawMethod === "paypal" && (
            <Input
              type="email"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
              placeholder="PayPal email"
              className="w-full sm:max-w-[320px]"
            />
          )}
          <Button variant="outline" size="sm" onClick={handleConnectSetup} disabled={connectSetup}>
            {connectSetup ? "Redirecting..." : "Setup / Manage Stripe Bank Payouts"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Customer payments land on Artha first, and your available earnings are credited here for withdrawal.
            Stripe bank withdrawals move funds into your Stripe Express payout account. PayPal withdrawals are queued for manual payout.
          </p>
          <p className="text-xs text-muted-foreground">
            Withdrawn so far: ${(totalWithdrawn / 100).toFixed(2)}
          </p>
        </CardContent>
      </Card>

      {transactions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Transaction History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-start sm:items-center justify-between text-sm p-2 border-b last:border-0 gap-2">
                  <div>
                    <p className="font-medium">
                      {tx.type === "income" ? "+" : "-"}$
                      {((tx.seller_net_amount_cents ?? tx.amount_cents) / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">{tx.description}</p>
                    {tx.type === "income" && tx.gross_amount_cents != null && (
                      <p className="text-xs text-muted-foreground">
                        Gross ${(tx.gross_amount_cents / 100).toFixed(2)}
                      </p>
                    )}
                    {tx.type === "withdrawal" && tx.external_payout_method && (
                      <p className="text-xs text-muted-foreground">
                        Method: {tx.external_payout_method === "paypal" ? "PayPal" : "Stripe bank payout"}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge variant={tx.status === "completed" ? "default" : "secondary"} className="text-[10px]">{tx.status}</Badge>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(tx.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
