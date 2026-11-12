import type { Metadata } from "next";
import { SimView } from "@/components/market/SimView";

export const metadata: Metadata = { title: "Market simulation" };

export default function MarketSimPage() {
  return <SimView />;
}
