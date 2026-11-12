import type { Metadata } from "next";
import { MarketView } from "@/components/market/MarketView";

export const metadata: Metadata = { title: "Market" };

export default function MarketPage() {
  return <MarketView />;
}
