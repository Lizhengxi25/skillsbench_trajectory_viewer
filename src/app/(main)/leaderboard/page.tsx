import type { Metadata } from "next";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata: Metadata = {
  title: "Agent Leaderboard",
  description:
    "Compare AI agent performance across SkillsBench tasks using available trajectory and result data. View model performance with and without skills.",
  alternates: { canonical: "https://skillsbench.ai/leaderboard" },
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
