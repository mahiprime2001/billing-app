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
    // Webpack's persistent filesystem cache intermittently crashes on
    // Node 24 too, separately from the hasher above -- a worker writes an
    // undefined pack buffer to disk and fs.writeFile throws
    // ERR_INVALID_ARG_TYPE, killing the whole `next build` (seen ~1 in 3
    // production builds, not every time, which is what makes it a cache
    // race rather than a deterministic bug). Memory cache sidesteps the
    // disk I/O entirely -- slightly slower rebuilds, no crash risk.
    config.cache = { type: 'memory' };
    return config;
  },
}; // Added semicolon here

export default nextConfig
