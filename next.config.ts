import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Prevents bundling errors for these heavy packages
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  
  // 2. FORCES Vercel to include the Chromium binaries in the API routes
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/@sparticuz/chromium/bin/**/*'
    ],
  },
};

export default nextConfig;