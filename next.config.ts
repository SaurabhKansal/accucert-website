import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // 1. Keep these as external so they are not bundled into a single broken file
  serverExternalPackages: [
    "tesseract.js",
    "tesseract.js-core",
    "tesseract-wasm",
    "bmp-js",
    "pako",
    "wasm-feature-detect",
    "sharp"
  ],

  // 2. Force Vercel to physically copy these folders to the server
  outputFileTracingIncludes: {
    "/**/*": [
      path.join(process.cwd(), "node_modules/tesseract.js/**/*"),
      path.join(process.cwd(), "node_modules/tesseract.js-core/**/*"),
      path.join(process.cwd(), "node_modules/tesseract-wasm/**/*"),
      path.join(process.cwd(), "node_modules/bmp-js/**/*"),
      path.join(process.cwd(), "node_modules/pako/**/*"),
      path.join(process.cwd(), "node_modules/wasm-feature-detect/**/*"),
      path.join(process.cwd(), "node_modules/sharp/**/*"),
      path.join(process.cwd(), "eng.traineddata"),
      path.join(process.cwd(), "public/**/*"),
    ],
  },
};

export default nextConfig;