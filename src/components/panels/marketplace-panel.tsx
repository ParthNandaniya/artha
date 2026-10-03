"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Project } from "@/lib/types";

interface MarketplacePanelProps {
  project: Project;
  onRefresh: () => void;
}

interface PricingPlan {
  id: string;
  public_id: string;
  slug: string;
  name: string;
  amount_cents: number;
  currency: string;
  billing_interval: string;
  interval_count: number;
  features: string[];
  active: boolean;
  sort_order: number;
  created_at: string;
}

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  plan_name: string | null;
  status: string;
  amount_cents: number | null;
  billing_interval: string | null;
  subscribed_at: string;
  canceled_at: string | null;
  current_period_end: string | null;
  created_at: string;
}

interface RevenueSummary {
  total_gross: number;
  total_fees: number;
  total_net: number;
}

export function MarketplacePanel({ project, onRefresh }: MarketplacePanelProps) {
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [revenue, setRevenue] = useState<RevenueSummary>({ total_gross: 0, total_fees: 0, total_net: 0 });
  const [loading, setLoading] = useState(true);

  // Settings state
  const [enabled, setEnabled] = useState(project.marketplace_enabled);
  const [feePercent, setFeePercent] = useState(String(project.marketplace_fee_percent));
  const [savingSettings, setSavingSettings] = useState(false);

  // New plan form state
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanPrice, setNewPlanPrice] = useState("");
  const [newPlanInterval, setNewPlanInterval] = useState<"month" | "year" | "one_time">("month");
  const [newPlanFeatures, setNewPlanFeatures] = useState("");
  const [addingPlan, setAddingPlan] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketplace?projectId=${project.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setPlans(data.plans || []);
      setSubscribers(data.subscribers || []);
      setRevenue(data.revenue || { total_gross: 0, total_fees: 0, total_net: 0 });
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSaveSettings() {
    const fee = parseInt(feePercent, 10);
    if (isNaN(fee) || fee < 0 || fee > 100) return;

    setSavingSettings(true);
    try {
      const res = await fetch("/api/marketplace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          marketplace_enabled: enabled,
          marketplace_fee_percent: fee,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to save settings");
        return;
      }
      onRefresh();
    } catch {
      alert("Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddPlan() {
    const priceCents = Math.round(parseFloat(newPlanPrice) * 100);
    if (!newPlanName || isNaN(priceCents) || priceCents < 0) return;

    const features = newPlanFeatures
      .split("\n")
      .map((f: string) => f.trim())
      .filter(Boolean);

    setAddingPlan(true);
    try {
      const res = await fetch("/api/marketplace/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          name: newPlanName,
          amount_cents: priceCents,
          billing_interval: newPlanInterval,
          features,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to create plan");
        return;
      }
      setNewPlanName("");
      setNewPlanPrice("");
      setNewPlanInterval("month");
      setNewPlanFeatures("");
      setShowAddPlan(false);
      fetchData();
    } catch {
      alert("Failed to create plan");
    } finally {
      setAddingPlan(false);
    }
  }

  async function handleDeletePlan(planId: string) {
    if (!confirm("Are you sure you want to delete this plan?")) return;

    setDeletingPlanId(planId);
    try {
      const res = await fetch(
        `/api/marketplace/plans?planId=${planId}&projectId=${project.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete plan");
        return;
      }
      fetchData();
    } catch {
      alert("Failed to delete plan");
    } finally {
      setDeletingPlanId(null);
    }
  }

  function getStatusVariant(status: string): "default" | "secondary" | "destructive" {
    if (status === "active" || status === "one_time") return "default";
    if (status === "canceled") return "destructive";
    return "secondary";
  }

  function getIntervalLabel(interval: string) {
    if (interval === "month") return "/mo";
    if (interval === "year") return "/yr";
    return " one-time";
  }

  const settingsChanged =
    enabled !== project.marketplace_enabled ||
    parseInt(feePercent, 10) !== project.marketplace_fee_percent;

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl">
        <h2 className="text-lg font-semibold mb-4">Marketplace</h2>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-6">
      <h2 className="text-lg font-semibold">Marketplace</h2>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marketplace Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Marketplace</Label>
              <p className="text-xs text-muted-foreground">
                Allow customers to purchase plans through your website
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Platform Fee (%)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="100"
                value={feePercent}
                onChange={(e) => setFeePercent(e.target.value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">% of each transaction</span>
            </div>
          </div>
          {settingsChanged && (
            <Button onClick={handleSaveSettings} disabled={savingSettings} size="sm">
              {savingSettings ? "Saving..." : "Save Settings"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Revenue Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Income</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(revenue.total_gross / 100).toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Platform Fees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(revenue.total_fees / 100).toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Net Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(revenue.total_net / 100).toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pricing Plans</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddPlan(!showAddPlan)}
            >
              {showAddPlan ? "Cancel" : "Add Plan"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddPlan && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Plan Name</Label>
                  <Input
                    value={newPlanName}
                    onChange={(e) => setNewPlanName(e.target.value)}
                    placeholder="e.g. Pro"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Price (USD)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPlanPrice}
                    onChange={(e) => setNewPlanPrice(e.target.value)}
                    placeholder="e.g. 29.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Billing Interval</Label>
                <div className="flex gap-2">
                  {(["month", "year", "one_time"] as const).map((interval) => (
                    <Button
                      key={interval}
                      type="button"
                      variant={newPlanInterval === interval ? "default" : "outline"}
                      size="sm"
                      onClick={() => setNewPlanInterval(interval)}
                    >
                      {interval === "month" ? "Monthly" : interval === "year" ? "Yearly" : "One-time"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Features (one per line)</Label>
                <textarea
                  value={newPlanFeatures}
                  onChange={(e) => setNewPlanFeatures(e.target.value)}
                  placeholder={"Unlimited access\nPriority support\nCustom branding"}
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  rows={3}
                />
              </div>
              <Button onClick={handleAddPlan} disabled={addingPlan || !newPlanName || !newPlanPrice} size="sm">
                {addingPlan ? "Creating..." : "Create Plan"}
              </Button>
            </div>
          )}

          {plans.length === 0 && !showAddPlan ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No pricing plans yet. Add one to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{plan.name}</p>
                      <Badge variant={plan.active ? "default" : "secondary"} className="text-[10px]">
                        {plan.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      ${(plan.amount_cents / 100).toFixed(2)}
                      {getIntervalLabel(plan.billing_interval)}
                    </p>
                    {Array.isArray(plan.features) && plan.features.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {plan.features.map((feature, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">
                            {String(feature)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive"
                    onClick={() => handleDeletePlan(plan.id)}
                    disabled={deletingPlanId === plan.id}
                  >
                    {deletingPlanId === plan.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscribers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Subscribers</CardTitle>
            {subscribers.length > 0 && (
              <Badge variant="default" className="text-xs">
                {subscribers.filter((s) => s.status === "active" || s.status === "one_time").length} active
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {subscribers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No subscribers yet.
            </p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-1">
                {subscribers.map((sub) => {
                  const statusLabel = sub.status === "one_time" ? "paid" : sub.status;
                  return (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between py-2.5 px-2 rounded-md hover:bg-muted/50 border-b last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {sub.name || sub.email}
                          </p>
                          <Badge variant={getStatusVariant(sub.status)} className="text-[10px] shrink-0">
                            {statusLabel}
                          </Badge>
                        </div>
                        {sub.name && (
                          <p className="text-xs text-muted-foreground truncate">{sub.email}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {sub.plan_name || "Plan"}
                          {sub.amount_cents != null && (
                            <>
                              {" \u2022 "}${(sub.amount_cents / 100).toFixed(2)}
                              {sub.billing_interval ? `/${sub.billing_interval === "month" ? "mo" : "yr"}` : " one-time"}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(sub.subscribed_at || sub.created_at).toLocaleDateString()}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
