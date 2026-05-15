import type { NextConfig } from 'next';

/** Server-side proxy target (not exposed to the browser). */
const backendOrigin =
  process.env.BACKEND_URL ||
  process.env.API_PROXY_URL ||
  'http://127.0.0.1:3001';

const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '3001' },
      { protocol: 'http', hostname: '127.0.0.1', port: '3001' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendOrigin.replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
};

export default config;
