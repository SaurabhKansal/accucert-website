import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js"],
  
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract-wasm/**/*", // Required for the 'corePath' above
      "./public/**/*",
    ],
  },
};

export default nextConfig;