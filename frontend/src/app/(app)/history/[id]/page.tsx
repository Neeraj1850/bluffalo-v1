import type { Metadata } from "next";
import { ReplayView } from "@/components/history/ReplayView";

export const metadata: Metadata = { title: "Replay" };

export default async function ReplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode } = await searchParams;
  return <ReplayView id={`#${id}`} mode={mode === "practice" ? "practice" : "real"} />;
}
