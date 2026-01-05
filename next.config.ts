import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sharp still needs to be external to handle its Linux binaries correctly
  serverExternalPackages: ["sharp", "tesseract.js", "tesseract.js-core"],
  
  outputFileTracingIncludes: {
    "/**/*": [
      "./public/**/*",
      "./eng.traineddata"
    ],
  },
};

export default nextConfig;