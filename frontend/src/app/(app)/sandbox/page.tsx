import { redirect } from "next/navigation";

/** Practice has its own tab now. */
export default function SandboxPage() {
  redirect("/practice");
}
