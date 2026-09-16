import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // The privacy statement is the club's PDF, not a page of its own. The old
        // route stays alive because bookmarks and printed references do: it now
        // hands the reader the document instead of the placeholder it used to show.
        source: "/datenschutz",
        destination: "/datenschutz-uhc-uster.pdf",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
