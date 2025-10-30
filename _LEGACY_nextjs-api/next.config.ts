import type { NextConfig } from 'next';
const { withExpo } = require('@expo/next-adapter');

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: 'avatar.vercel.sh',
      },
    ],
  },
  // Transpile React Native packages for web compatibility
  transpilePackages: [
    'react-native',
    'react-native-web',
    'expo',
    'react-native-reanimated',
    'react-native-svg',
    'nativewind',
    'react-native-gesture-handler',
  ],
};

export default withExpo(nextConfig);
