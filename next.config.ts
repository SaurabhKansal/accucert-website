import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js", "tesseract-wasm", "sharp"],
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract-wasm/**/*",
      "./node_modules/sharp/**/*",
      "./public/**/*",
      "./eng.traineddata" // Explicitly include the language file
    ],
  },
};

export default nextConfig;