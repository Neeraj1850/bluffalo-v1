import type { Metadata } from "next";
import { SessionView } from "@/components/sessions/SessionView";

export const metadata: Metadata = { title: "Test session" };

export default async function StrategySessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionView mode="practice" id={id} back={{ href: "/strategy", label: "Strategy" }} />;
}
