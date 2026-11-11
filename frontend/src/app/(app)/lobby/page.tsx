import { redirect } from "next/navigation";

/** Tables are picked when you go live now. */
export default function LobbyPage() {
  redirect("/live");
}
