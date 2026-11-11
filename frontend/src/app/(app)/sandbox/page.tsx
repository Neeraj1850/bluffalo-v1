import { redirect } from "next/navigation";

/** Practice now lives on the Strategy page, next to the settings it tests. */
export default function SandboxPage() {
  redirect("/strategy?test=1");
}
