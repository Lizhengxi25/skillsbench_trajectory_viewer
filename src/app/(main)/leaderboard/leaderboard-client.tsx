"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Leaderboard } from "@/components/Leaderboard";
import {
  LeaderboardDetail,
  type SampleTrajectory,
  type Condition,
} from "@/components/LeaderboardDetail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  leaderboardData,
  SORT_OPTIONS,
  type SortKey,
  type LeaderboardEntry,
} from "@/data/leaderboard-data";
import trajectoriesIndex from "@/data/trajectories-index.json";
import type {
  TrajectoryIndexEntry,
  TrajectorySummary,
  TrajectoryStep as ParsedTrajectoryStep,
} from "@/utils/trajectory-types";
import type { TrajectoryStep as DetailTrajectoryStep } from "@/components/TrajectoryViewer";

const TRAJECTORY_CACHE_VERSION = "2026-03-16-fulltext";

const SORT_KEY_TO_CONDITION: Record<SortKey, Condition> = {
  with_skills: "withskills",
  raw: "noskills",
  normalized_delta: "withskills",
};

const CONDITION_TO_INDEX: Record<Condition, TrajectoryIndexEntry["condition"]> = {
  noskills: "No Skills",
  withskills: "With Skills",
  gen: "Self-Generated",
};

const INDEX_TO_CONDITION: Record<TrajectoryIndexEntry["condition"], Condition> = {
  "No Skills": "noskills",
  "With Skills": "withskills",
  "Self-Generated": "gen",
};

function getTrialsForEntry(
  entry: LeaderboardEntry | null,
  condition: Condition,
): TrajectoryIndexEntry[] {
  if (!entry) return [];
  const wantedCondition = CONDITION_TO_INDEX[condition];
  return (trajectoriesIndex as TrajectoryIndexEntry[])
    .filter(
      (trial) =>
        trial.model === entry.model &&
        trial.harness === entry.harness &&
        trial.condition === wantedCondition,
    )
    .sort(
      (a, b) =>
        b.reward - a.reward ||
        a.execTimeSec - b.execTimeSec ||
        a.task.localeCompare(b.task),
    );
}

function availableConditions(entry: LeaderboardEntry): Condition[] {
  const set = new Set<Condition>();
  for (const trial of trajectoriesIndex as TrajectoryIndexEntry[]) {
    if (trial.model === entry.model && trial.harness === entry.harness) {
      set.add(INDEX_TO_CONDITION[trial.condition]);
    }
  }
  return ["noskills", "withskills", "gen"].filter((condition) =>
    set.has(condition as Condition),
  ) as Condition[];
}

function buildDetailTrajectory(
  entry: LeaderboardEntry,
  trial: TrajectoryIndexEntry,
  condition: Condition,
  summary: TrajectorySummary,
): SampleTrajectory {
  const steps: DetailTrajectoryStep[] = summary.steps.flatMap((step) =>
    flattenTrajectoryStep(step),
  );

  return {
    model: entry.model,
    harness: entry.harness,
    family: entry.family,
    taskName: trial.task,
    condition,
    result: trial.reward > 0 ? "pass" : "fail",
    duration: summary.execTimeSec || trial.execTimeSec,
    steps,
    trialId: trial.trialId,
    reward: trial.reward,
  };
}

function flattenTrajectoryStep(step: ParsedTrajectoryStep): DetailTrajectoryStep[] {
  const timestamp = step.timestamp || "";
  const roleType = step.role === "tool_result" ? "tool_result" : "message";

  const flattened: DetailTrajectoryStep[] = [];
  if (step.text && step.text.trim().length > 0) {
    flattened.push({
      timestamp,
      type: roleType,
      content: step.text,
    });
  }

  if (step.toolCalls && step.toolCalls.length > 0) {
    for (const toolCall of step.toolCalls) {
      flattened.push({
        timestamp,
        type: "tool_call",
        toolName: toolCall.name,
        content: toolCall.input_summary || "",
      });
    }
  }

  if (step.output_summary && step.output_summary.trim().length > 0) {
    flattened.push({
      timestamp,
      type: "tool_result",
      toolName: step.toolName,
      content: step.output_summary,
    });
  }

  return flattened;
}

export function LeaderboardClient() {
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(
    [...leaderboardData].sort((a, b) => b.withSkills - a.withSkills)[0] ?? null,
  );
  const [sortKey, setSortKeyState] = useState<SortKey>("with_skills");
  const [selectedCondition, setSelectedCondition] = useState<Condition>("withskills");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [selectedTrialByKey, setSelectedTrialByKey] = useState<Record<string, string>>({});
  const [trajectoryByTrial, setTrajectoryByTrial] = useState<Record<string, TrajectorySummary | null>>({});

  const setSortKey = useCallback((key: SortKey) => {
    setSortKeyState(key);
    const condition = SORT_KEY_TO_CONDITION[key];
    setSelectedCondition(condition);
    const sorted = [...leaderboardData].sort((a, b) => {
      switch (key) {
        case "raw": return b.noSkills - a.noSkills;
        case "with_skills": return b.withSkills - a.withSkills;
        case "normalized_delta": return b.normalizedGain - a.normalizedGain;
      }
    });
    setSelectedEntry(sorted[0] ?? null);
  }, []);

  const conditions = selectedEntry ? availableConditions(selectedEntry) : [];
  const trials = useMemo(
    () => getTrialsForEntry(selectedEntry, selectedCondition),
    [selectedEntry, selectedCondition],
  );
  const trialKey = selectedEntry
    ? `${selectedEntry.harness}::${selectedEntry.model}::${selectedCondition}`
    : "";
  const selectedTrialId = useMemo(() => {
    if (trials.length === 0) return "";
    const picked = selectedTrialByKey[trialKey];
    if (picked && trials.some((trial) => trial.trialId === picked)) return picked;
    return trials[0].trialId;
  }, [trials, selectedTrialByKey, trialKey]);
  const selectedTrial = useMemo(
    () => trials.find((trial) => trial.trialId === selectedTrialId) ?? null,
    [trials, selectedTrialId],
  );
  const selectedCacheKey = `${selectedTrialId}::${TRAJECTORY_CACHE_VERSION}`;
  const hasTrajectoryRecord =
    selectedTrialId !== "" &&
    Object.prototype.hasOwnProperty.call(trajectoryByTrial, selectedCacheKey);
  const isTrajectoryLoading = selectedTrialId !== "" && !hasTrajectoryRecord;
  const trajectorySummary =
    selectedTrialId && hasTrajectoryRecord ? trajectoryByTrial[selectedCacheKey] : null;
  const trajectory = useMemo(() => {
    if (!selectedEntry || !selectedTrial || !trajectorySummary) return null;
    return buildDetailTrajectory(
      selectedEntry,
      selectedTrial,
      selectedCondition,
      trajectorySummary,
    );
  }, [selectedEntry, selectedTrial, selectedCondition, trajectorySummary]);

  useEffect(() => {
    if (!selectedTrial) return;
    const trialCacheKey = `${selectedTrial.trialId}::${TRAJECTORY_CACHE_VERSION}`;
    if (Object.prototype.hasOwnProperty.call(trajectoryByTrial, trialCacheKey)) return;

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
      .then((response) => {
        if (!response.ok) throw new Error("Trajectory not found");
        return response.json() as Promise<TrajectorySummary>;
      })
      .then((summary) => {
        if (cancelled) return;
        setTrajectoryByTrial((prev) => ({ ...prev, [trialCacheKey]: summary }));
      })
      .catch(() => {
        if (cancelled) return;
        setTrajectoryByTrial((prev) => ({ ...prev, [trialCacheKey]: null }));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTrial, trajectoryByTrial]);

  const handleSelectEntry = (entry: LeaderboardEntry) => {
    setSelectedEntry(entry);
    const available = availableConditions(entry);
    if (!available.includes(selectedCondition)) {
      setSelectedCondition(available[0] ?? SORT_KEY_TO_CONDITION[sortKey]);
    }
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileDetailOpen(true);
    }
  };

  if (!selectedEntry) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-24 md:pt-28 w-full">
        <h1 className="text-3xl font-bold tracking-tight mb-4">Agent Leaderboard</h1>
        <p className="text-muted-foreground text-lg">
          No leaderboard results are currently available.
        </p>
      </div>
    );
  }

  const handleSelectCondition = (condition: Condition) => {
    setSelectedCondition(condition);
  };

  const handleSelectTrial = (trialId: string) => {
    if (!trialKey) return;
    setSelectedTrialByKey((prev) => ({ ...prev, [trialKey]: trialId }));
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Page header */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-24 md:pt-28 w-full">
        <Link
          href="/"
          className="text-muted-foreground text-sm hover:text-foreground transition-colors flex items-center gap-2 mb-6 group w-fit"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </Link>
        <h1 className="text-3xl font-bold tracking-tight mb-4">Agent Leaderboard</h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Performance benchmarks of AI agents on SkillsBench using currently available results and trajectories. Click a model to inspect details.
        </p>
      </div>

      {/* Sort controls */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-6 pb-4 w-full">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm mr-1">Sort by</span>
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                sortKey === key
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Unified master-detail panel */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 w-full flex-1 pb-8">
        <div className="border border-border overflow-hidden">
          <div className="flex flex-col lg:flex-row">
            {/* Left: Leaderboard — natural height, all models visible */}
            <div className="lg:w-[420px] lg:flex-shrink-0 lg:border-r border-b lg:border-b-0 border-border">
              <Leaderboard
                selectedEntry={selectedEntry}
                onSelectEntry={handleSelectEntry}
                onSelectCondition={handleSelectCondition}
                selectedCondition={selectedCondition}
                sortKey={sortKey}
                compact
              />
            </div>

            {/* Right: Detail Panel — sticky so it stays in view */}
            <div className="hidden lg:flex flex-1 min-w-0 flex-col overflow-hidden sticky top-20 self-start h-[calc(100dvh-5rem)]">
              <LeaderboardDetail
                entry={selectedEntry}
                trajectory={trajectory}
                condition={selectedCondition}
                conditions={conditions}
                onConditionChange={handleSelectCondition}
                trials={trials}
                selectedTrialId={selectedTrialId}
                onTrialChange={handleSelectTrial}
                isTrajectoryLoading={isTrajectoryLoading}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/Tablet: Detail modal */}
      <Dialog open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <DialogContent className="max-w-2xl h-[85dvh] flex flex-col p-0 gap-0 lg:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {selectedEntry.harness} — {selectedEntry.model}
            </DialogTitle>
            <DialogDescription>
              Execution trace and results for {selectedEntry.model}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 flex flex-col overflow-hidden">
            <LeaderboardDetail
              entry={selectedEntry}
              trajectory={trajectory}
              condition={selectedCondition}
              conditions={conditions}
              onConditionChange={handleSelectCondition}
              trials={trials}
              selectedTrialId={selectedTrialId}
              onTrialChange={handleSelectTrial}
              isTrajectoryLoading={isTrajectoryLoading}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
