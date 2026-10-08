// URL slugs for providers ("Western Union" <-> "western-union") and the
// canonical form of a head-to-head pair ("paypal-vs-wise": alphabetical, so
// every pair has exactly one URL). Pure, so both the pages and the tests use
// it (lib/provider-slug.test.mjs).

export function providerSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The provider whose slug matches, from the names that exist in this context.
export function providerFromSlug(slug: string, names: string[]): string | null {
  return names.find((n) => providerSlug(n) === slug) ?? null;
}

// "paypal-vs-wise" for either argument order; null if they're the same provider.
export function pairSlug(a: string, b: string): string | null {
  const [sa, sb] = [providerSlug(a), providerSlug(b)];
  if (sa === sb) return null;
  return sa < sb ? `${sa}-vs-${sb}` : `${sb}-vs-${sa}`;
}

// Splits "western-union-vs-wise" into its two slugs. The separator is "-vs-",
// which no provider slug contains, so a single split is unambiguous.
export function parsePairSlug(pair: string): [string, string] | null {
  const parts = pair.split("-vs-");
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) return null;
  return [parts[0], parts[1]];
}
