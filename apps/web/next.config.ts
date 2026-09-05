import { config } from "dotenv";
import type { NextConfig } from "next";

config({
  path: "../../.env",
});

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
