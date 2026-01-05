import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Existing config */
  serverExternalPackages: ["tesseract.js"],
  
  // This tells Next.js to include these files in the production build
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/tesseract.js/**/*'],
  },
};

export default nextConfig;