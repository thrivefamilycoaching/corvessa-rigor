import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  turbopack: {},
  webpack: (config) => {
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules\/pdfjs-dist/,
      type: "javascript/auto",
    });
    config.module.rules.push({
      test: /\.json$/,
      include: /node_modules\/pdfjs-dist/,
      type: "json",
    });
    return config;
  },
};

export default nextConfig;
