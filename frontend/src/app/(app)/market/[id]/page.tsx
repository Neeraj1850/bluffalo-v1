import type { Metadata } from "next";
import { ListingView } from "@/components/market/ListingView";

export const metadata: Metadata = { title: "Strategy license" };

export default async function MarketStrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingView id={id} />;
}
