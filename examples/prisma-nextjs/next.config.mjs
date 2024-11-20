import { join } from 'path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: join(import.meta.dirname, '../../')
};

export default nextConfig;
