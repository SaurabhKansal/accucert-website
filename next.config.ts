import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevents bundling of the library so internal paths remain valid
  serverExternalPackages: ["tesseract.js"],

  // Forces Next.js to include these hidden dependencies in the deployment
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/tesseract.js/**/*", "./public/**/*"],
  },
};

export default nextConfig;