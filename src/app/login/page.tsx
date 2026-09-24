import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isAuthed, passwordConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthed()) redirect("/");
  return <LoginForm configured={passwordConfigured()} />;
}
