import type { Metadata } from "next";
import { StrategyView } from "@/components/strategy/StrategyView";

export const metadata: Metadata = { title: "Strategy" };

export default async function StrategyPage({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
  const { test } = await searchParams;
  return <StrategyView autoTest={test === "1"} />;
}
