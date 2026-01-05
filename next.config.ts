import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Prevents Tesseract from being bundled into a single file (keeps paths intact)
  serverExternalPackages: ["tesseract.js"],

  // 2. Ensures necessary files are physically copied to the production server
  outputFileTracingIncludes: {
    // Includes Tesseract worker/wasm binaries for all API routes
    "/api/**/*": ["./node_modules/tesseract.js/**/*"],
    // Ensures any files in your public folder are available to the server
    "/**/*": ["./public/**/*"],
  },
};

export default nextConfig;