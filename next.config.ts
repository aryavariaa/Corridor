import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Italy->Bangladesh used to be keyed by member country (IT); as of
  // 2026-09-11 all Eurozone corridors are keyed by currency (EUR) instead,
  // since SEPA rate/fee data doesn't vary by which Eurozone country you
  // send from. This pair may already be indexed or shared under its old
  // URL, so redirect rather than let it fall back to the "not available
  // yet" state. Add a line here for any other corridor that gets re-keyed
  // the same way in the future.
  //
  // The equivalent Spain->Colombia redirect (/compare/ES/CO ->
  // /compare/EUR/CO) was removed 2026-09-14 when the EUR->CO corridor
  // itself was removed -- redirecting to a corridor that no longer exists
  // would just land on the same "not available yet" state one hop later.
  async redirects() {
    return [
      {
        source: "/compare/IT/BD",
        destination: "/compare/EUR/BD",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
