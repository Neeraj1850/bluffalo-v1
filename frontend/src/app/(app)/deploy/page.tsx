import type { Metadata } from "next";
import { Suspense } from "react";
import { DeployView } from "@/components/deploy/DeployView";

export const metadata: Metadata = { title: "Confirm deployment" };

export default function DeployPage() {
  return (
    <Suspense>
      <DeployView />
    </Suspense>
  );
}
