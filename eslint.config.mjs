import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 1. Setup compatibility helpers for the new Flat Config system
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // 2. Ignore directories (replaces globalIgnores)
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  
  // 3. Wrap legacy Next.js configs using the compat tool
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;