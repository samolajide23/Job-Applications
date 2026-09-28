import { Dashboard } from "@/components/dashboard";
import { DatabaseConfigError, readRules } from "@/lib/db";
import type { QueueRules } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Shell-first: rules only on the server. Applications load client-side as a
 * slim JSON payload so the HTML document stays small and paints quickly.
 */
export default async function HomePage() {
  let rules: QueueRules | null = null;
  let message = "The application history could not be loaded.";
  try {
    rules = await readRules();
  } catch (error) {
    if (error instanceof DatabaseConfigError) message = error.message;
    console.error(error);
  }
  if (!rules) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">
        <h1 className="text-2xl font-semibold">Job applications</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      </main>
    );
  }
  return <Dashboard initialRules={rules} />;
}
