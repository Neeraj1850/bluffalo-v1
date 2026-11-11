import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (frontend/Dockerfile).
  output: "standalone",
  // No Next.js dev badge: it sat on the nav rail's Sign out button.
  devIndicators: false,
};

export default nextConfig;
