import type { Metadata } from "next";
import { SessionView } from "@/components/sessions/SessionView";

export const metadata: Metadata = { title: "Session" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionView mode="practice" id={id} />;
}
