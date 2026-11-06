import type { Metadata } from "next";
import { GameView } from "@/components/game/GameView";

export const metadata: Metadata = { title: "Live game" };

export default function GamePage() {
  return <GameView />;
}
