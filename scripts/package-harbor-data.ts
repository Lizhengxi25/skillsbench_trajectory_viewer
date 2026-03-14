import fs from "fs";
import path from "path";

const JOB_DATES = ["2026-03-12__23-23-51", "2026-03-13__23-23-09"];

const FILES_TO_COPY = [
  "config.json",
  "result.json",
  path.join("verifier", "reward.txt"),
  path.join("agent", "trajectory.json"),
];

function copyFileIfExists(srcPath: string, dstPath: string): boolean {
  if (!fs.existsSync(srcPath)) return false;
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.copyFileSync(srcPath, dstPath);
  return true;
}

function packageHarborData(): void {
  const sourceJobsRoot = path.join(process.cwd(), "..", "..", "..", "jobs");
  const outputRoot = path.join(process.cwd(), "public", "harbor-jobs");

  if (!fs.existsSync(sourceJobsRoot)) {
    throw new Error(`Source jobs root not found: ${sourceJobsRoot}`);
  }

  fs.mkdirSync(outputRoot, { recursive: true });

  let copiedTrials = 0;
  let copiedFiles = 0;

  for (const jobDate of JOB_DATES) {
    const sourceJobDir = path.join(sourceJobsRoot, jobDate);
    const outputJobDir = path.join(outputRoot, jobDate);

    if (!fs.existsSync(sourceJobDir)) {
      console.warn(`[package] Skip missing job dir: ${sourceJobDir}`);
      continue;
    }

    // Recreate per-job output dir to avoid stale trials from previous packaging.
    fs.rmSync(outputJobDir, { recursive: true, force: true });
    fs.mkdirSync(outputJobDir, { recursive: true });

    const entries = fs.readdirSync(sourceJobDir, { withFileTypes: true });
    let jobTrialCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const trialId = entry.name;
      const sourceTrialDir = path.join(sourceJobDir, trialId);
      const outputTrialDir = path.join(outputJobDir, trialId);

      let trialHasData = false;
      for (const relPath of FILES_TO_COPY) {
        const copied = copyFileIfExists(
          path.join(sourceTrialDir, relPath),
          path.join(outputTrialDir, relPath),
        );
        if (copied) {
          copiedFiles += 1;
          trialHasData = true;
        }
      }

      if (trialHasData) {
        copiedTrials += 1;
        jobTrialCount += 1;
      }
    }

    console.log(`[package] ${jobDate}: copied ${jobTrialCount} trials`);
  }

  console.log(`[package] Done. copiedTrials=${copiedTrials}, copiedFiles=${copiedFiles}`);
  console.log(`[package] Output dir: ${outputRoot}`);
}

packageHarborData();
