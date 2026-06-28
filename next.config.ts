import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile sits in the parent
  // "Claude Code" folder, which Next would otherwise infer as the root).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
