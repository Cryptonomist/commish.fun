import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* `ws` ships two optional native accelerators, and the Solana mobile-wallet
   * packages pull `ws` in transitively. Neither is needed in a browser bundle,
   * and neither builds without native toolchain steps that npm skipped here, so
   * webpack is told not to resolve them rather than failing on a missing
   * index.js. `pino-pretty` is the same story from the logging side. */
  webpack: (config) => {
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      "bufferutil",
      "utf-8-validate",
      "pino-pretty",
    ];
    return config;
  },
};

export default nextConfig;
