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
    "/**/*": [
      path.join(process.cwd(), "node_modules/tesseract.js/**/*"),
      path.join(process.cwd(), "node_modules/tesseract.js-core/**/*"),
      path.join(process.cwd(), "node_modules/wasm-feature-detect/**/*"),
      path.join(process.cwd(), "node_modules/bmp-js/**/*"),
      path.join(process.cwd(), "node_modules/pako/**/*"),
      path.join(process.cwd(), "node_modules/sharp/**/*"),
      path.join(process.cwd(), "eng.traineddata"),
    ],
  },
};

export default nextConfig;