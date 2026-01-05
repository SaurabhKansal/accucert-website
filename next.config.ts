import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Opt-out of bundling for ALL related packages
  serverExternalPackages: [
    "tesseract.js",
    "tesseract.js-core", // ✅ Added this
    "tesseract-wasm",
    "bmp-js",
    "pako",
    "wasm-feature-detect",
    "sharp"
  ],

  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*", // ✅ Crucial: Includes SIMD and standard cores
      "./node_modules/tesseract-wasm/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/pako/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/sharp/**/*",
      "./eng.traineddata",
      "./public/**/*",
    ],
  },
};

export default nextConfig;