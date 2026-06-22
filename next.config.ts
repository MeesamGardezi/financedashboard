import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'tesseract.js', 'sharp'],
};

export default nextConfig;
