// A single string identifier for a corridor, derived from its send/receive
// pair rather than stored anywhere -- convenient at the edges (URL query
// params, Amplitude event properties, Buttondown tags) where a single
// opaque string is easier to pass around than two. Never treat this as the
// data model itself; the (sendCountry, receiveCountry) pair is.
//
// Its own module (not lib/corridors.ts) so client components can use it
// without bundling the whole data file into the browser.
export function corridorId(c: { sendCountry: string; receiveCountry: string }): string {
  return `${c.sendCountry}-${c.receiveCountry}`;
}
