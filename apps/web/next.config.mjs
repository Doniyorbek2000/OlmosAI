/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@veyra/types', 'three'],
  eslint: {
    // Lint is run separately in CI via turbo.
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    return [
      {
        // Proxy API calls so cookies are first-party in dev.
        source: '/api/:path*',
        destination: `${api}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
