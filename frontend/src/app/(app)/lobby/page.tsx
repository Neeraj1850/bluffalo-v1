import type { Metadata } from "next";
import { LobbyView } from "@/components/lobby/LobbyView";

export const metadata: Metadata = { title: "Tables" };

export default function LobbyPage() {
  return <LobbyView />;
}
