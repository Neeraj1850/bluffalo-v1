import type { Metadata } from "next";
import { AgentProfileView } from "@/components/profile/AgentProfileView";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <AgentProfileView agentKey={decodeURIComponent(key)} />;
}
