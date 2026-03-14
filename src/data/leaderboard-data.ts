import resultsRegistry from "./results-registry.json";

export type SortKey = "raw" | "with_skills" | "normalized_delta";

export interface LeaderboardEntry {
  harness: string;
  model: string;
  family: "anthropic" | "google" | "openai" | "alibaba";
  noSkills: number;
  noSkillsCi: number;
  withSkills: number;
  withSkillsCi: number;
  delta: number;
  normalizedGain: number;
  tasks: number;
  trialsPerTask: number;
  gen?: number;
  genCi?: number;
}

export const BRAND_COLORS: Record<string, string> = {
  anthropic: "#D97757",
  google: "#4285F4",
  openai: "#10A37F",
  alibaba: "#FF6A00",
};

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "with_skills", label: "With Skills" },
  { key: "raw", label: "Without Skills" },
  { key: "normalized_delta", label: "Normalized Gain (g)" },
];

interface TaskResult {
  task: string;
  model: string;
  harness: string;
  family: "anthropic" | "google" | "openai" | "alibaba";
  condition: "No Skills" | "With Skills" | "Self-Generated";
  trials: number;
  passCount: number;
}

interface ConditionStats {
  pass: number;
  trials: number;
  tasks: Set<string>;
}

function emptyStats(): ConditionStats {
  return { pass: 0, trials: 0, tasks: new Set<string>() };
}

function scoreFromStats(stats: ConditionStats): { score: number; ci: number } {
  if (stats.trials === 0) return { score: 0, ci: 0 };
  const p = stats.pass / stats.trials;
  const se = Math.sqrt((p * (1 - p)) / stats.trials);
  return {
    score: p * 100,
    ci: 1.96 * se * 100,
  };
}

export const leaderboardData: LeaderboardEntry[] = (() => {
  const byModel = new Map<string, {
    model: string;
    harness: string;
    family: "anthropic" | "google" | "openai" | "alibaba";
    noSkills: ConditionStats;
    withSkills: ConditionStats;
    gen: ConditionStats;
  }>();

  for (const r of resultsRegistry as TaskResult[]) {
    const key = `${r.harness}::${r.model}`;
    if (!byModel.has(key)) {
      byModel.set(key, {
        model: r.model,
        harness: r.harness,
        family: r.family,
        noSkills: emptyStats(),
        withSkills: emptyStats(),
        gen: emptyStats(),
      });
    }

    const entry = byModel.get(key)!;
    const stats =
      r.condition === "No Skills"
        ? entry.noSkills
        : r.condition === "Self-Generated"
          ? entry.gen
          : entry.withSkills;

    stats.pass += r.passCount;
    stats.trials += r.trials;
    stats.tasks.add(r.task);
  }

  const computed: LeaderboardEntry[] = [];
  for (const entry of byModel.values()) {
    const withSkills = scoreFromStats(entry.withSkills);
    const noSkills = scoreFromStats(entry.noSkills);
    const gen = scoreFromStats(entry.gen);

    const delta = withSkills.score - noSkills.score;
    const normalizedGain =
      noSkills.score >= 100
        ? 0
        : ((withSkills.score - noSkills.score) / (100 - noSkills.score)) * 100;

    const tasks = Math.max(
      entry.withSkills.tasks.size,
      entry.noSkills.tasks.size,
      entry.gen.tasks.size,
    );

    const conditionForTrials =
      entry.withSkills.trials > 0
        ? entry.withSkills
        : entry.noSkills.trials > 0
          ? entry.noSkills
          : entry.gen;
    const trialsPerTask =
      tasks > 0 ? Math.round(conditionForTrials.trials / tasks) : 0;

    computed.push({
      harness: entry.harness,
      model: entry.model,
      family: entry.family,
      noSkills: noSkills.score,
      noSkillsCi: noSkills.ci,
      withSkills: withSkills.score,
      withSkillsCi: withSkills.ci,
      delta,
      normalizedGain,
      tasks,
      trialsPerTask,
      ...(entry.gen.trials > 0 ? { gen: gen.score, genCi: gen.ci } : {}),
    });
  }

  return computed.sort((a, b) => b.withSkills - a.withSkills);
})();
