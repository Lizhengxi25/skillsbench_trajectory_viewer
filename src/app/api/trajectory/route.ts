import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  parseTrajectory,
  getFormatForAgent,
  getTrajectoryFileNames,
} from "@/utils/trajectory-parser";
import type { TrajectorySummary } from "@/utils/trajectory-types";

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/benchflow-ai/skillsbench-trajectories/main/xiangyi-completed";

/**
 * GET /api/trajectory?trialId=...&conditionDir=...&agentName=...&task=...&model=...&modelShort=...&harness=...&family=...&condition=...&reward=...&execTimeSec=...
 *
 * For Harbor trials (conditionDir starts with "harbor-jobs/"), reads trajectory from local filesystem.
 * For other trials, fetches raw trajectory from GitHub.
 * Results are cached at the edge for 1 hour (immutable data).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const trialId = searchParams.get("trialId");
  const conditionDir = searchParams.get("conditionDir");
  const agentName = searchParams.get("agentName");

  if (!trialId || !conditionDir || !agentName) {
    return NextResponse.json(
      { error: "Missing required params: trialId, conditionDir, agentName" },
      { status: 400 }
    );
  }

  const fileNames = getTrajectoryFileNames(agentName);
  if (fileNames.length === 0) {
    return NextResponse.json(
      { error: `Unknown agent: ${agentName}` },
      { status: 400 }
    );
  }

  let rawContent: string | null = null;

  if (conditionDir.startsWith("harbor-jobs/")) {
    // Read from local Harbor jobs directory or bundled website assets
    // conditionDir format: "harbor-jobs/2026-03-12__23-23-51"
    const jobDate = conditionDir.slice("harbor-jobs/".length);
    const candidateRoots = [
      path.join(process.cwd(), "..", "..", "..", "jobs"),
      path.join(process.cwd(), "public", "harbor-jobs"),
    ];
    for (const fileName of fileNames) {
      for (const root of candidateRoots) {
        const filePath = path.join(root, jobDate, trialId, fileName);
        if (fs.existsSync(filePath)) {
          rawContent = fs.readFileSync(filePath, "utf-8");
          break;
        }
      }
      if (rawContent) break;
    }
    if (!rawContent) {
      return NextResponse.json(
        { error: `Trajectory file not found for trial ${trialId}` },
        { status: 404 }
      );
    }
  } else {
    // Fetch from GitHub
    for (const fileName of fileNames) {
      const url = `${GITHUB_RAW_BASE}/${conditionDir}/${trialId}/${fileName}`;
      try {
        const res = await fetch(url, { next: { revalidate: 3600 } });
        if (res.ok) {
          rawContent = await res.text();
          break;
        }
      } catch {
        // try next candidate
      }
    }
    if (!rawContent) {
      return NextResponse.json(
        { error: "Trajectory file not found on GitHub" },
        { status: 404 }
      );
    }
  }

  const format = getFormatForAgent(agentName);
  const steps = parseTrajectory(rawContent, format);

  const task = searchParams.get("task") || trialId.split("__")[0];
  const summary: TrajectorySummary = {
    task,
    trialId,
    model: searchParams.get("model") || "",
    modelShort: searchParams.get("modelShort") || "",
    harness: searchParams.get("harness") || "",
    family: (searchParams.get("family") as "anthropic" | "google" | "openai" | "alibaba") || "anthropic",
    condition: (searchParams.get("condition") as "No Skills" | "With Skills" | "Self-Generated") || "No Skills",
    reward: parseFloat(searchParams.get("reward") || "0"),
    execTimeSec: parseInt(searchParams.get("execTimeSec") || "0", 10),
    totalSteps: steps.length,
    steps,
  };

  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
