import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This ensures Vercel bundles your fonts and images with your API functions
  outputFileTracingIncludes: {
    '/api/**/*': ['./public/fonts/**/*', './public/*.png'],
  },
  // Since we are using pdf-lib and fontkit (which use Node.js features)
  serverExternalPackages: ['pdf-lib', '@pdf-lib/fontkit'],
};

export default nextConfig;