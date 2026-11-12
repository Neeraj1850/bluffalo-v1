import type { Metadata } from "next";
import { SessionView } from "@/components/sessions/SessionView";

export const metadata: Metadata = { title: "Session" };

export default async function HistorySessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const mode = (await searchParams).mode === "practice" ? "practice" : "real";
  return <SessionView mode={mode} id={id} back={{ href: `/history?mode=${mode}&view=sessions`, label: "History" }} />;
}
