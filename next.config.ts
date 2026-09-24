import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@neondatabase/serverless", "@electric-sql/pglite"],
  // The dev server is bound on 0.0.0.0. Browsers that open 127.0.0.1 are
  // otherwise treated as cross-origin, so client JS never hydrates.
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/*": ["./data/seed.csv"],
  },
};

export default nextConfig;
