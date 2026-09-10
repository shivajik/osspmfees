import type { NextConfig } from "next";

// Turbopack finds the project root itself from the lockfile beside this file.
// Pinning it to `__dirname` used to hand Turbopack whatever drive-letter casing
// the shell happened to start with on Windows ("c:\..." vs "C:\..."), which made
// it lose track of node_modules mid-session and panic with
// "Next.js package not found".
const nextConfig: NextConfig = {};

export default nextConfig;
