/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  output: 'export',
  webpack: (config) => {
    // Avoid webpack's default xxhash64 (WASM) hasher — it crashes
    // intermittently on Node 24 ("Cannot read properties of undefined
    // (reading 'length')" in WasmHash).
    config.output.hashFunction = 'sha256';
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8080/api/:path*',
      },
    ];
  },
}; // Added semicolon here

export default nextConfig
