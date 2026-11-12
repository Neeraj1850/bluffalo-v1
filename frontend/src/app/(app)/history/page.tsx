import type { Metadata } from "next";
import { HistoryView } from "@/components/history/HistoryView";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ mode?: string; view?: string }> }) {
  const { mode, view } = await searchParams;
  return (
    <HistoryView
      key={mode}
      mode={mode === "practice" ? "practice" : "real"}
      view={view === "sessions" ? "sessions" : "hands"}
    />
  );
}
