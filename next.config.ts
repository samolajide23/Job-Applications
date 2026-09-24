import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@neondatabase/serverless", "@electric-sql/pglite"],
  outputFileTracingIncludes: {
    "/*": ["./data/seed.csv"],
  },
};

export default nextConfig;
