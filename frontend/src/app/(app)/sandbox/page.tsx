import { redirect } from "next/navigation";

/** Testing lives on the Strategy tab now. */
export default function SandboxPage() {
  redirect("/strategy/test");
}
