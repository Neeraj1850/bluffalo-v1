import { redirect } from "next/navigation";

/** History now lives in each mode's tab, as sessions. */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  redirect(mode === "practice" ? "/practice" : "/live");
}
