import type { Metadata } from "next";
import { HistoryView } from "@/components/history/HistoryView";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <HistoryView key={mode} mode={mode === "practice" ? "practice" : "real"} />;
}
