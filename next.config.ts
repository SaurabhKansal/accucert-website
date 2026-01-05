import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Keep these as external so their internal structure isn't messed up
  serverExternalPackages: ["tesseract.js", "tesseract-wasm", "bmp-js"],
  
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract-wasm/**/*",
      "./node_modules/bmp-js/**/*", // ✅ Add this line
      "./public/**/*",
    ],
  },
};

export default nextConfig;