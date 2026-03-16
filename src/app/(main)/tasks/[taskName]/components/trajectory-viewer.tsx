"use client";

import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BRAND_COLORS } from "@/utils/brand-colors";
import type { TrajectoryIndexEntry, TrajectorySummary, TrajectoryStep } from "@/utils/trajectory-types";
import {
  Play,
  ChevronDown,
  ChevronRight,
  Terminal,
  Bot,
  User,
  AlertCircle,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface TrajectoryViewerProps {
  trajectoryIndex: TrajectoryIndexEntry[];
}

const TRAJECTORY_CACHE_VERSION = "2026-03-16-fulltext";

export function TrajectoryViewer({ trajectoryIndex }: TrajectoryViewerProps) {
  const [selectedModelOverride, setSelectedModelOverride] = useState<string>("");
  const [selectedConditionOverride, setSelectedConditionOverride] = useState<string>("");
  const [selectedTrialOverride, setSelectedTrialOverride] = useState<string>("");
  const [trajectoryCache, setTrajectoryCache] = useState<Record<string, TrajectorySummary | null>>({});
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  // Available models
  const models = useMemo(() => {
    const set = new Map<string, TrajectoryIndexEntry>();
    for (const t of trajectoryIndex) {
      if (!set.has(t.model)) set.set(t.model, t);
    }
    return Array.from(set.values()).sort((a, b) => {
      // Sort by best withSkills reward desc
      const aTrials = trajectoryIndex.filter((t) => t.model === a.model);
      const bTrials = trajectoryIndex.filter((t) => t.model === b.model);
      const aMax = Math.max(...aTrials.map((t) => t.reward));
      const bMax = Math.max(...bTrials.map((t) => t.reward));
      return bMax - aMax;
    });
  }, [trajectoryIndex]);

  const selectedModel = useMemo(() => {
    if (selectedModelOverride && models.some((model) => model.model === selectedModelOverride)) {
      return selectedModelOverride;
    }
    return models[0]?.model ?? "";
  }, [models, selectedModelOverride]);

  // Available conditions for selected model
  const conditions = useMemo(() => {
    if (!selectedModel) return [];
    const set = new Set<string>();
    for (const t of trajectoryIndex) {
      if (t.model === selectedModel) set.add(t.condition);
    }
    return Array.from(set).sort();
  }, [trajectoryIndex, selectedModel]);

  // Available trials for selected model+condition
  const selectedCondition = useMemo(() => {
    if (selectedConditionOverride && conditions.includes(selectedConditionOverride)) {
      return selectedConditionOverride;
    }
    return conditions.find((condition) => condition === "With Skills") || conditions[0] || "";
  }, [conditions, selectedConditionOverride]);

  // Available trials for selected model+condition
  const trials = useMemo(() => {
    if (!selectedModel || !selectedCondition) return [];
    return trajectoryIndex
      .filter((t) => t.model === selectedModel && t.condition === selectedCondition)
      .sort((a, b) => b.reward - a.reward || a.execTimeSec - b.execTimeSec);
  }, [trajectoryIndex, selectedModel, selectedCondition]);

  const selectedTrialId = useMemo(() => {
    if (selectedTrialOverride && trials.some((trial) => trial.trialId === selectedTrialOverride)) {
      return selectedTrialOverride;
    }
    return trials[0]?.trialId ?? "";
  }, [trials, selectedTrialOverride]);

  const selectedTrial = useMemo(
    () => trials.find((trial) => trial.trialId === selectedTrialId) ?? null,
    [trials, selectedTrialId],
  );
  const selectedCacheKey = `${selectedTrialId}::${TRAJECTORY_CACHE_VERSION}`;

  useEffect(() => {
    if (!selectedTrial) return;
    const trialCacheKey = `${selectedTrial.trialId}::${TRAJECTORY_CACHE_VERSION}`;
    if (Object.prototype.hasOwnProperty.call(trajectoryCache, trialCacheKey)) return;

    const params = new URLSearchParams({
      trialId: selectedTrial.trialId,
      conditionDir: selectedTrial.conditionDir,
      agentName: selectedTrial.agentName,
      task: selectedTrial.task,
      model: selectedTrial.model,
      modelShort: selectedTrial.modelShort,
      harness: selectedTrial.harness,
      family: selectedTrial.family,
      condition: selectedTrial.condition,
      reward: String(selectedTrial.reward),
      execTimeSec: String(selectedTrial.execTimeSec),
    });
    // Bump query key when parser/format changes to bypass stale HTTP caches.
    params.set("v", TRAJECTORY_CACHE_VERSION);

    let cancelled = false;
    void fetch(`/api/trajectory?${params.toString()}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json() as Promise<TrajectorySummary>;
      })
      .then((data) => {
        if (cancelled) return;
        setTrajectoryCache((prev) => ({ ...prev, [trialCacheKey]: data }));
      })
      .catch(() => {
        if (cancelled) return;
        setTrajectoryCache((prev) => ({ ...prev, [trialCacheKey]: null }));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTrial, trajectoryCache]);

  const hasTrajectoryRecord =
    selectedTrialId !== "" &&
    Object.prototype.hasOwnProperty.call(trajectoryCache, selectedCacheKey);
  const trajectory = selectedTrialId && hasTrajectoryRecord ? trajectoryCache[selectedCacheKey] : null;
  const loading = selectedTrialId !== "" && !hasTrajectoryRecord;
  const allExpanded = Boolean(
    trajectory &&
      trajectory.steps.length > 0 &&
      trajectory.steps.every((step) => expandedSteps.has(step.index)),
  );

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedSteps(new Set());
    } else {
      setExpandedSteps(new Set(trajectory?.steps.map((s) => s.index) || []));
    }
  };

  if (trajectoryIndex.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Play className="w-12 h-12 mx-auto mb-4 opacity-40" />
        <p>No trajectory data available for this task.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Picker controls */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Model picker */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Model</label>
          <select
            value={selectedModel}
            onChange={(event) => {
              setSelectedModelOverride(event.target.value);
              setSelectedConditionOverride("");
              setSelectedTrialOverride("");
              setExpandedSteps(new Set());
            }}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {models.map((m) => (
              <option key={m.model} value={m.model}>{m.model}</option>
            ))}
          </select>
        </div>

        {/* Condition picker */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Condition</label>
          <select
            value={selectedCondition}
            onChange={(event) => {
              setSelectedConditionOverride(event.target.value);
              setSelectedTrialOverride("");
              setExpandedSteps(new Set());
            }}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {conditions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Trial picker */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Trial</label>
          <select
            value={selectedTrialId}
            onChange={(event) => {
              setSelectedTrialOverride(event.target.value);
              setExpandedSteps(new Set());
            }}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {trials.map((t, i) => (
              <option key={t.trialId} value={t.trialId}>
                Trial {i + 1} — {t.reward === 1 ? "Pass" : t.reward === 0 ? "Fail" : `${(t.reward * 100).toFixed(0)}%`} — {t.execTimeSec}s
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Trial info bar */}
      {selectedTrial && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge
            variant="outline"
            className="gap-1.5"
            style={{ borderColor: BRAND_COLORS[selectedTrial.family] }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: BRAND_COLORS[selectedTrial.family] }}
            />
            {selectedTrial.harness}
          </Badge>
          <Badge variant={selectedTrial.reward === 1 ? "default" : "destructive"} className="gap-1">
            {selectedTrial.reward === 1 ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
            {selectedTrial.reward === 1
              ? "Pass"
              : selectedTrial.reward === 0
                ? "Fail"
                : `${(selectedTrial.reward * 100).toFixed(0)}%`}
          </Badge>
          <span className="text-muted-foreground text-xs flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {selectedTrial.execTimeSec}s
          </span>
          {trajectory && (
            <span className="text-muted-foreground text-xs">
              {trajectory.totalSteps} steps
            </span>
          )}
        </div>
      )}

      {/* Trajectory content */}
      {loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
          <p className="text-sm">Loading trajectory...</p>
        </div>
      )}

      {!loading && !trajectory && selectedTrialId && (
        <div className="text-center py-12 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Trajectory data not available for this trial.</p>
        </div>
      )}

      {!loading && trajectory && trajectory.steps.length > 0 && (
        <Card className="overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="text-xs text-muted-foreground font-medium">Execution Trace</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={toggleAll}
            >
              {allExpanded ? (
                <><ChevronsDownUp className="w-3.5 h-3.5" /> Collapse All</>
              ) : (
                <><ChevronsUpDown className="w-3.5 h-3.5" /> Expand All</>
              )}
            </Button>
          </div>

          {/* Steps */}
          <div className="divide-y divide-border">
            {trajectory.steps.map((step) => (
              <StepRow
                key={step.index}
                step={step}
                expanded={expandedSteps.has(step.index)}
                onToggle={() => toggleStep(step.index)}
                family={trajectory.family}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function StepRow({
  step,
  expanded,
  onToggle,
  family,
}: {
  step: TrajectoryStep;
  expanded: boolean;
  onToggle: () => void;
  family: string;
}) {
  const icon = step.role === "user" ? (
    <User className="w-4 h-4 text-blue-500 flex-shrink-0" />
  ) : step.role === "assistant" ? (
    <Bot className="w-4 h-4 flex-shrink-0" style={{ color: BRAND_COLORS[family] || "#888" }} />
  ) : (
    <Terminal className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  );

  const label = step.role === "user"
    ? "User"
    : step.role === "assistant"
      ? "Assistant"
      : step.toolName
        ? `Result: ${step.toolName}`
        : "Tool Result";

  // Determine preview text
  let preview = "";
  if (step.text) {
    preview = step.text;
  } else if (step.toolCalls && step.toolCalls.length > 0) {
    preview = step.toolCalls.map((tc) => `${tc.name}: ${tc.input_summary}`).join(" | ");
  } else if (step.output_summary) {
    preview = step.output_summary;
  }

  return (
    <div
      className={`group cursor-pointer hover:bg-muted/20 transition-colors ${step.isError ? "bg-red-50/50 dark:bg-red-950/10" : ""}`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 mt-0.5 min-w-0 shrink-0">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            {step.toolCalls?.map((tc, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-mono">
                {tc.name}
              </Badge>
            ))}
            {step.isError && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5 gap-1">
                <AlertCircle className="w-3 h-3" /> Error
              </Badge>
            )}
          </div>

          {!expanded && preview && (
            <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2 font-mono">
              {preview}
            </p>
          )}

          {expanded && (
            <div className="mt-2 space-y-2">
              {step.text && (
                <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/50 rounded-md p-3 border border-border overflow-x-auto max-h-80">
                  {step.text}
                </pre>
              )}
              {step.toolCalls?.map((tc, i) => (
                <div key={i} className="space-y-1">
                  <Badge variant="outline" className="text-[10px] font-mono">{tc.name}</Badge>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/50 rounded-md p-3 border border-border overflow-x-auto max-h-60">
                    {tc.input_summary}
                  </pre>
                </div>
              ))}
              {step.output_summary && (
                <pre className={`text-xs font-mono whitespace-pre-wrap break-all rounded-md p-3 border overflow-x-auto max-h-60 ${
                  step.isError
                    ? "bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
                    : "bg-muted/50 border-border"
                }`}>
                  {step.output_summary}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
