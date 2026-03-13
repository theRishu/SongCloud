import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co", pathname: "/**" },
      { protocol: "https", hostname: "a.saavncdn.com", pathname: "/**" },
      { protocol: "https", hostname: "b.saavncdn.com", pathname: "/**" },
      { protocol: "https", hostname: "c.saavncdn.com", pathname: "/**" },
      { protocol: "https", hostname: "d.saavncdn.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
