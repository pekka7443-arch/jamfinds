import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl (Task 16): wraps the config so server components can resolve
// translations; reads src/i18n/request.ts by default.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "standalone",
  // web-push (Task 16 push fan-out) must ship inside the standalone bundle —
  // the deployed container has no parent node_modules to fall back to.
  serverExternalPackages: ["web-push"],
  // Type errors must fail the build — real errors were previously hidden here.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
