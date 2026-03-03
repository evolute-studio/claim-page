import type { NextConfig } from 'next';

function readAllowedDevOrigins(): string[] {
  const fromEnv = process.env.NEXT_ALLOWED_DEV_ORIGINS
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  return ['192.168.31.94', '172.29.170.18', 'localhost', '*.localhost'];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: readAllowedDevOrigins(),
};

export default nextConfig;
