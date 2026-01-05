import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "tesseract.js",
    "tesseract.js-core",
    "sharp",
    "bmp-js",
    "pako",
    "wasm-feature-detect"
  ],

  outputFileTracingIncludes: {
    // This glob ensures that ANY serverless function (like your API)
    // carries the entire library folder.
    "/**/*": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/pako/**/*",
      "./node_modules/sharp/**/*",
      "./eng.traineddata",
    ],
  },
};

export default nextConfig;