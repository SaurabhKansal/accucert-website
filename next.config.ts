import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tesseract.js", "tesseract-wasm", "bmp-js", "sharp"],
  
  outputFileTracingIncludes: {
    '/**/api/ocr/**/*': [
      path.join(__dirname, 'node_modules/tesseract.js/**/*'),
      path.join(__dirname, 'node_modules/tesseract-wasm/**/*'),
      path.join(__dirname, 'node_modules/bmp-js/**/*'),
      path.join(__dirname, 'node_modules/pako/**/*'),
      path.join(__dirname, 'eng.traineddata'),
    ],
  },
};

export default nextConfig;