import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Essential for Puppeteer to run in Vercel functions
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  
  // 2. Explicitly force Vercel to include the Chromium binaries
  // We use a broad glob to ensure all necessary brotli/bin files are captured
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/@sparticuz/chromium/bin/**/*'
    ],
  },
};

export default nextConfig;