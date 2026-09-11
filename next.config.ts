import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Italy->Bangladesh and Spain->Colombia used to be keyed by member
  // country (IT, ES); as of 2026-09-11 all Eurozone corridors are keyed
  // by currency (EUR) instead, since SEPA rate/fee data doesn't vary by
  // which Eurozone country you send from. These two pairs may already be
  // indexed or shared under their old URLs, so redirect rather than let
  // them fall back to the "not available yet" state. Add a line here for
  // any other corridor that gets re-keyed the same way in the future.
  async redirects() {
    return [
      {
        source: "/compare/IT/BD",
        destination: "/compare/EUR/BD",
        permanent: true,
      },
      {
        source: "/compare/ES/CO",
        destination: "/compare/EUR/CO",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
