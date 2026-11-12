import type { Metadata } from "next";
import { TestView } from "@/components/strategy/TestView";

export const metadata: Metadata = { title: "Test your agent" };

export default function StrategyTestPage() {
  return <TestView />;
}
