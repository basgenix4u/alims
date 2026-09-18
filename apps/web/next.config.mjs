/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@alims/contracts'],
  // Resolve the shared contracts package to its TypeScript source so the
  // compiler handles it as a first-class ESM module (the built dist is
  // CommonJS for the API and trips the dev-server refresh transform).
  webpack: (config) => {
    config.resolve.alias['@alims/contracts'] = new URL('../../packages/contracts/src/index.ts', import.meta.url).pathname;
    return config;
  },
  // Browser calls /api/* on its own origin; Next proxies to the API service.
  // Never point browser code at localhost — it is not the same host as the API.
  async rewrites() {
    const target = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};
export default nextConfig;
