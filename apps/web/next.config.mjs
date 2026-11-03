/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@yui/contracts", "@yui/core"],
  serverExternalPackages: ["better-sqlite3"],
  // Workspace packages pakai specifier ESM TS ("./foo.js" → foo.ts); webpack butuh
  // extensionAlias agar bisa resolve ke sumber .ts — standar untuk monorepo Next.js.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};
export default nextConfig;
