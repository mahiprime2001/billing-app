/** @type {import('next').NextConfig} */
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

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
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.plugins.push(
        new MiniCssExtractPlugin({
          filename: 'static/css/[name].css',
          chunkFilename: 'static/css/[id].css',
        })
      );
    }
    return config;
  },
}

export default nextConfig
