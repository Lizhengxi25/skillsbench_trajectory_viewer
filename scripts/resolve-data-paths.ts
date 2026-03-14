import fs from "fs";
import path from "path";

function firstExistingPath(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve paths to Harbor job directories for local evaluation results.
 * Returns an array of {jobPath, jobDate} for each job directory found.
 */
export function resolveHarborJobsPaths(): { jobPath: string; jobDate: string }[] {
  const jobsRoot = firstExistingPath([
    path.join(process.cwd(), "..", "..", "..", "jobs"),
    path.join(process.cwd(), "..", "..", "jobs"),
    path.join(process.cwd(), "public", "harbor-jobs"),
    path.join(__dirname, "..", "..", "..", "jobs"),
  ]);
  if (!jobsRoot) return [];

  const jobDates = ["2026-03-12__23-23-51", "2026-03-13__23-23-09"];
  const result: { jobPath: string; jobDate: string }[] = [];
  for (const jobDate of jobDates) {
    const jobPath = path.join(jobsRoot, jobDate);
    if (fs.existsSync(jobPath)) {
      result.push({ jobPath, jobDate });
    }
  }
  return result;
}

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/benchflow-ai/skillsbench-trajectories/main";

/**
 * Resolve the path to the xiangyi-completed trajectories directory.
 * Checks local sibling paths (dev/CI setup). Returns null if not found.
 */
export function resolveTrajectoryBase(): string | null {
  const localCandidates = [
    path.join(process.cwd(), "..", "..", "..", "skillsbench-trajectories", "xiangyi-completed"),
    path.join(process.cwd(), "..", "..", "skillsbench-trajectories", "xiangyi-completed"),
    path.join(__dirname, "..", "..", "..", "skillsbench-trajectories", "xiangyi-completed"),
    path.join(__dirname, "..", "..", "skillsbench-trajectories", "xiangyi-completed"),
    path.join(__dirname, "..", "skillsbench-trajectories", "xiangyi-completed"),
  ];

  for (const candidate of localCandidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[data] Using local trajectories: ${candidate}`);
      return candidate;
    }
  }

  console.warn(`[data] Trajectories directory not found locally`);
  return null;
}

/**
 * Resolve the path to the tasks directory (for verifiers).
 */
export function resolveTasksDir(): string | null {
  const candidates = [
    path.join(process.cwd(), "..", "tasks"),
    path.join(process.cwd(), "..", "..", "tasks"),
    path.join(__dirname, "..", "..", "tasks"),
    path.join(__dirname, "..", "tasks"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[data] Using local tasks: ${candidate}`);
      return candidate;
    }
  }

  console.warn(`[data] Tasks directory not found in any expected location`);
  return null;
}

/**
 * Ensure output directory exists and write a JSON file.
 */
export function writeJsonOutput(outputPath: string, data: unknown): void {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
}

/**
 * Fetch a pre-generated JSON file from the trajectories GitHub repo.
 * Used as a fallback when local trajectory data isn't available (e.g., Vercel builds).
 */
export async function fetchFromGitHub<T>(fileName: string): Promise<T | null> {
  const url = `${GITHUB_RAW_BASE}/website-data/${fileName}`;
  console.log(`[data] Fetching from GitHub: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[data] GitHub fetch failed: ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[data] GitHub fetch error:`, (err as Error).message);
    return null;
  }
}
