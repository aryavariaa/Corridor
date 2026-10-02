// Outbound "Go to <provider>" links for the comparison rows.
//
// Corridor never moves money: these are plain links to each provider's own
// site, opened in a new tab, with no redirect through our backend and no
// tracking parameters. Where a provider's URL scheme can name the corridor
// (and, for Western Union, the amount) we deep-link to it; where it can't, we
// link to that provider's general send-money page for the sender's country.
// A link says nothing about the freshness of the quote beside it.
//
// Every pattern below was checked against the live provider site on
// 2026-10-02 (HTTP 200, and the page itself names the right corridor -- a bare
// 200 isn't enough: Paysend serves a 200 "United Kingdom to China" page for
// any URL it doesn't recognise, and MoneyGram's app silently redirects
// unknown paths to its home page). Pages drift, so re-verify with the
// scripts/check-provider-links.mjs script before trusting a pattern again
// after a long gap.

export type TransferLinkInput = {
  provider: string;
  sendCountry: string; // "US" | "GB" | "CA" | "AU" | "EUR" (Eurozone, see Corridor.sendCountry)
  receiveCountry: string; // ISO 3166-1 alpha-2
  receiveCurrency: string;
  // Amount being compared, in the sending currency. Only used by providers
  // whose start page accepts it (Western Union).
  amount?: number;
  // The stored data row's `source` string (not the ranked row's: that one is
  // rewritten for custom amounts). PayPal rows quoted from Xoom (PayPal's
  // remittance service) link to that Xoom corridor page, because that is the
  // page where the quote shown can actually be reproduced.
  source?: string;
};

// Eurozone senders have no single country. Ireland is the one Eurozone
// market where every provider below has an English-language site.
const SEND_SITE: Record<string, string> = {
  US: "us",
  GB: "gb",
  CA: "ca",
  AU: "au",
  EUR: "ie",
};

// "united-kingdom", "canada" ... for Paysend's from-X-to-Y paths.
const SEND_NAME: Record<string, string> = {
  GB: "united-kingdom",
  CA: "canada",
  AU: "australia",
};

// Wise's slugs are irregular ("the-uk", "the-usa", "the-netherlands").
const WISE_SLUG: Record<string, string> = {
  AT: "austria",
  AU: "australia",
  BD: "bangladesh",
  CA: "canada",
  DE: "germany",
  ES: "spain",
  FR: "france",
  GB: "the-uk",
  IE: "ireland",
  IN: "india",
  IT: "italy",
  MX: "mexico",
  NL: "the-netherlands",
  PH: "philippines",
  PT: "portugal",
  US: "the-usa",
  VN: "vietnam",
  ZA: "south-africa",
};

// Plain country slugs shared by the providers that only serve the
// remittance-style destinations (Remitly, WorldRemit, XE, Revolut, Ria,
// Paysend). Eurozone/English-speaking destinations aren't offered by them.
const REMIT_SLUG: Record<string, string> = {
  BD: "bangladesh",
  IN: "india",
  MX: "mexico",
  PH: "philippines",
  VN: "vietnam",
  ZA: "south-africa",
};

// PayPal's own international-transfer page, by sending site.
const PAYPAL_PAGE: Record<string, string> = {
  US: "https://www.paypal.com/us/digital-wallet/send-receive-money/send-money-internationally",
  GB: "https://www.paypal.com/uk/webapps/mpp/digital-wallet/send-receive-money/send-money-internationally",
  CA: "https://www.paypal.com/ca/digital-wallet/send-receive-money/send-money-internationally",
  AU: "https://www.paypal.com/au/digital-wallet/send-receive-money/send-money-internationally",
  // PayPal Ireland has no international-transfer page; this is its
  // English-language send-money page.
  EUR: "https://www.paypal.com/ie/digital-wallet/send-receive-money/send-money",
};

function wise(i: TransferLinkInput): string | null {
  const slug = WISE_SLUG[i.receiveCountry];
  const site = SEND_SITE[i.sendCountry];
  return slug && site ? `https://wise.com/${site}/send-money/send-money-to-${slug}` : null;
}

function westernUnion(i: TransferLinkInput): string | null {
  const site = SEND_SITE[i.sendCountry];
  if (!site) return null;
  const base = `https://www.westernunion.com/${site}/en/web/send-money/start`;
  const params = new URLSearchParams({
    ReceiveCountry: i.receiveCountry,
    ISOCurrency: i.receiveCurrency,
  });
  if (i.amount && i.amount > 0) params.set("SendAmount", String(Math.round(i.amount)));
  return `${base}?${params.toString()}`;
}

function paypal(i: TransferLinkInput): string | null {
  // "xoom.com/germany/send-money?locale=..." -> https://www.xoom.com/germany/send-money
  const xoom = i.source?.match(/^xoom\.com\/([a-z-]+)\/send-money/);
  if (xoom) return `https://www.xoom.com/${xoom[1]}/send-money`;
  return PAYPAL_PAGE[i.sendCountry] ?? null;
}

function remitly(i: TransferLinkInput): string | null {
  const slug = REMIT_SLUG[i.receiveCountry];
  const site = SEND_SITE[i.sendCountry];
  return slug && site
    ? `https://www.remitly.com/${site}/en/money-transfer/send-money-to-${slug}`
    : null;
}

// Sender country comes from the visitor's location, so no sending-side path.
function worldRemit(i: TransferLinkInput): string | null {
  const slug = REMIT_SLUG[i.receiveCountry];
  return slug ? `https://www.worldremit.com/en/${slug}` : null;
}

function xe(i: TransferLinkInput): string | null {
  const slug = REMIT_SLUG[i.receiveCountry];
  const site = i.sendCountry === "EUR" ? "en-eu" : `en-${SEND_SITE[i.sendCountry]}`;
  return slug ? `https://www.xe.com/${site}/send-money/send-money-to-${slug}/` : null;
}

// Revolut's UK site has no locale prefix. It has US, AU and IE sites; it has
// no Canadian one (/en-CA/ is a 404), so Canadian senders get the unprefixed
// page, which is Revolut's own destination page with the UK as the sender.
const REVOLUT_PREFIX: Record<string, string> = {
  US: "en-US/",
  AU: "en-AU/",
  EUR: "en-IE/",
  GB: "",
  CA: "",
};

function revolut(i: TransferLinkInput): string | null {
  const slug = REMIT_SLUG[i.receiveCountry];
  const prefix = REVOLUT_PREFIX[i.sendCountry];
  return slug && prefix !== undefined
    ? `https://www.revolut.com/${prefix}money-transfer/send-money-to-${slug}/`
    : null;
}

function ria(i: TransferLinkInput): string | null {
  const slug = REMIT_SLUG[i.receiveCountry];
  const site = SEND_SITE[i.sendCountry];
  return slug && site ? `https://www.riamoneytransfer.com/en-${site}/send-money-to-${slug}/` : null;
}

// MoneyGram's app ignores corridor paths (they redirect to the home page), so
// this is the sending country's landing page, which hosts the send form.
function moneyGram(i: TransferLinkInput): string | null {
  const site = SEND_SITE[i.sendCountry];
  return site ? `https://www.moneygram.com/${site}/en` : null;
}

// Paysend's from-X-to-Y paths work for GB/CA/AU senders only; the US and
// Eurozone ones fall through to a "United Kingdom to China" default page, so
// those senders get the localized home page.
function paysend(i: TransferLinkInput): string | null {
  const site = SEND_SITE[i.sendCountry];
  if (!site) return null;
  const from = SEND_NAME[i.sendCountry];
  const to = REMIT_SLUG[i.receiveCountry];
  if (from && to) return `https://paysend.com/en-${site}/send-money/from-${from}-to-${to}`;
  return `https://paysend.com/en-${site}`;
}

const BUILDERS: Record<string, (i: TransferLinkInput) => string | null> = {
  Wise: wise,
  "Western Union": westernUnion,
  PayPal: paypal,
  Remitly: remitly,
  WorldRemit: worldRemit,
  XE: xe,
  Revolut: revolut,
  Ria: ria,
  MoneyGram: moneyGram,
  Paysend: paysend,
};

// The provider's transfer page for this corridor, or null if we have no
// verified URL for it (the UI then shows no link rather than a guess).
export function providerTransferUrl(input: TransferLinkInput): string | null {
  return BUILDERS[input.provider]?.(input) ?? null;
}
