// Force update 2
import type { NextConfig } from "next";
// ... the rest of your code

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