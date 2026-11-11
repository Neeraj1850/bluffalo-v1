import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (frontend/Dockerfile).
  output: "standalone",
  // The dev badge defaults to bottom-left, on top of the nav rail's Sign out button.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
