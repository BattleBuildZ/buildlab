import type { NextConfig } from "next";

// Every page is per-user and reads the session cookie, so Cache Components (static shells) is intentionally off.
const nextConfig: NextConfig = {};

export default nextConfig;
