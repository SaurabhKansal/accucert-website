/** @type {import('next').NextConfig} */
const nextConfig = {
  // Essential for serverless functions to skip minification of these binaries
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/@sparticuz/chromium/bin/**/*'
    ],
  },
};

export default nextConfig;