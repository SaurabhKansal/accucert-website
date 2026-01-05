import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js", "tesseract-wasm", "bmp-js", "sharp"], // ✅ Added sharp
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract-wasm/**/*",
      "./node_modules/bmp-js/**/*",
      "./node_modules/sharp/**/*", // ✅ Added sharp
      "./public/**/*",
    ],
  },
};

export default nextConfig;