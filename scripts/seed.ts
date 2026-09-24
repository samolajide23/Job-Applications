import { loadDashboard } from "../src/lib/db";

const { applications } = await loadDashboard();
const tracked = applications.filter(
  (application) => !["discovered", "queued", "dismissed"].includes(application.status),
);
console.log(`Database ready. ${applications.length} rows, ${tracked.length} in the tracker.`);
