"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────

type StepType = "pageview" | "click" | "form";

interface FunnelStep {
  type: StepType;
  value: string;
}

interface FunnelStepResult {
  name: string;
  visitors: number;
  dropoff_pct: number;
}

interface FunnelResult {
  steps: FunnelStepResult[];
  overall_conversion: number;
}

interface FunnelBuilderProps {
  projectId: string;
}

// ── Colors ───────────────────────────────────────────────────────────

const STEP_COLORS = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#c084fc",
  "#d8b4fe",
];

const TYPE_LABELS: Record<StepType, string> = {
  pageview: "Page View",
  click: "Click",
  form: "Form Submit",
};

// ── Component ────────────────────────────────────────────────────────

export function FunnelBuilder({ projectId }: FunnelBuilderProps) {
  const [steps, setSteps] = useState<FunnelStep[]>([
    { type: "pageview", value: "/" },
  ]);
  const [result, setResult] = useState<FunnelResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStep = () => {
    setSteps((prev) => [...prev, { type: "pageview", value: "" }]);
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: keyof FunnelStep, value: string) => {
    setSteps((prev) =>
      prev.map((step, i) =>
        i === index ? { ...step, [field]: value } : step
      )
    );
  };

  const calculate = useCallback(async () => {
    const validSteps = steps.filter((s) => s.value.trim());
    if (validSteps.length < 2) {
      setError("Add at least 2 steps with values to calculate a funnel.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/analytics/funnels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: validSteps }),
      });

      if (!res.ok) {
        throw new Error("Failed to calculate funnel");
      }

      const data = (await res.json()) as FunnelResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [steps, projectId]);

  const chartData = result?.steps.map((step, i) => ({
    name: step.name,
    visitors: step.visitors,
    fill: STEP_COLORS[i % STEP_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Step Builder */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Funnel Steps</h3>
          <Button size="sm" variant="outline" onClick={addStep}>
            + Add Step
          </Button>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center gap-2">
              <Badge variant="secondary" className="shrink-0 w-6 h-6 flex items-center justify-center p-0 text-xs">
                {index + 1}
              </Badge>

              <select
                value={step.type}
                onChange={(e) => updateStep(index, "type", e.target.value)}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pageview">Page View</option>
                <option value="click">Click</option>
                <option value="form">Form Submit</option>
              </select>

              <Input
                value={step.value}
                onChange={(e) => updateStep(index, "value", e.target.value)}
                placeholder={
                  step.type === "pageview"
                    ? "/page-path"
                    : step.type === "click"
                      ? "Button text or #id"
                      : "Form name"
                }
                className="flex-1"
              />

              {steps.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeStep(index)}
                  className="text-gray-400 hover:text-red-500 shrink-0"
                >
                  X
                </Button>
              )}
            </div>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <Button onClick={calculate} disabled={loading} className="w-full">
          {loading ? "Calculating..." : "Calculate Funnel"}
        </Button>
      </Card>

      {/* Funnel Visualization */}
      {result && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Funnel Results</h3>
            <Badge variant="secondary">
              {result.overall_conversion}% conversion
            </Badge>
          </div>

          {/* Bar Chart */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value) => [`${value} visitors`, "Visitors"]}
                />
                <Bar dataKey="visitors" radius={[0, 4, 4, 0]}>
                  {chartData?.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Step Details */}
          <div className="space-y-2">
            {result.steps.map((step, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm py-1"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ background: STEP_COLORS[i % STEP_COLORS.length] }}
                  />
                  <span className="text-gray-700">{step.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{step.visitors}</span>
                  {i > 0 && step.dropoff_pct > 0 && (
                    <span className="text-xs text-red-500">
                      -{step.dropoff_pct}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
