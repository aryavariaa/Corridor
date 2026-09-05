import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack (Next.js 16.3.4) fails to resolve @vercel/analytics's
  // conditional package exports even though Node/tsc resolve them fine
  // (confirmed: plain `node --input-type=module -e "import(...)"` works).
  // transpilePackages forces Next to run the package through its own
  // bundling pipeline instead of treating it as a pre-built external,
  // which sidesteps the Turbopack resolution bug.
  transpilePackages: ["@vercel/analytics"],
};

export default nextConfig;
