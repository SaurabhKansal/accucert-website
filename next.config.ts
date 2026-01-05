import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Tell Next.js NOT to bundle these (keep them as separate files)
  serverExternalPackages: [
    "tesseract.js", 
    "tesseract-wasm", 
    "bmp-js", 
    "pako", 
    "wasm-feature-detect",
    "sharp"
  ],

  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract-wasm/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/pako/**/*",
      "./node_modules/wasm-feature-detect/**/*", // ✅ The missing piece
      "./node_modules/sharp/**/*",
      "./eng.traineddata",
      "./public/**/*",
    ],
  },
};

export default nextConfig;