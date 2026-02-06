import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas", "canvas"],
  turbopack: {},
  webpack: (config, { isServer }) => {
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
    if (isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: "@napi-rs/canvas",
      };
    }
    return config;
  },
};

export default nextConfig;
