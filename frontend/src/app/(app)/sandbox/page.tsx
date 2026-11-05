import type { Metadata } from "next";
import { SandboxView } from "@/components/sandbox/SandboxView";

export const metadata: Metadata = { title: "Practice mode" };

export default function SandboxPage() {
  return <SandboxView />;
}
