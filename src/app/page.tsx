import { Dashboard } from "@/components/dashboard";
import { DatabaseConfigError, loadDashboard } from "@/lib/db";
import type { Application, QueueRules } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let applications: Application[] | null = null;
  let rules: QueueRules | null = null;
  let message = "The application history could not be loaded.";
  try {
    const data = await loadDashboard();
    applications = data.applications;
    rules = data.rules;
  } catch (error) {
    if (error instanceof DatabaseConfigError) message = error.message;
    console.error(error);
  }
  if (!applications || !rules) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
        <h1 className="text-2xl font-semibold">Job applications</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      </main>
    );
  }
  return <Dashboard initialApplications={applications} initialRules={rules} />;
}
