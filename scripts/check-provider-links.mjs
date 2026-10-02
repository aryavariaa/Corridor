// Checks every outbound provider link the app can generate (lib/provider-links.ts)
// against the live provider sites: HTTP status, and -- for deep links -- that
// the landing page's <title> actually names the destination country. A bare
// 200 isn't enough (Paysend returns a 200 "United Kingdom to China" page for
// URLs it doesn't recognise).
//
//   node scripts/check-provider-links.mjs            # all distinct links
//   node scripts/check-provider-links.mjs --provider Wise
//
// Exit code 1 if any link fails. Providers that bot-block plain HTTP (403)
// or render their title client-side are reported as UNCHECKED, not passed:
// open those in a browser by hand.
import { readFileSync } from "node:fs";
import { providerTransferUrl } from "../lib/provider-links.ts";

const data = JSON.parse(readFileSync(new URL("../data/provider-data.json", import.meta.url), "utf8"));
const only = process.argv.includes("--provider") ? process.argv[process.argv.indexOf("--provider") + 1] : null;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const corridorByKey = new Map(data.corridors.map((c) => [`${c.sendCountry}|${c.receiveCountry}`, c]));

// Distinct links, keyed by URL, remembering one representative row.
const links = new Map();
for (const r of data.providerRates) {
  if (only && r.provider !== only) continue;
  const c = corridorByKey.get(`${r.sendCountry}|${r.receiveCountry}`);
  const url = providerTransferUrl({
    provider: r.provider,
    sendCountry: r.sendCountry,
    receiveCountry: r.receiveCountry,
    receiveCurrency: c.receiveCurrency,
    amount: r.sendAmount,
    source: r.source,
  });
  if (!url) {
    console.log(`NO LINK   ${r.provider} ${r.sendCountry}->${r.receiveCountry}`);
    process.exitCode = 1;
    continue;
  }
  if (!links.has(url)) links.set(url, { r, c });
}

// What the landing page's title must contain for a deep link to count as
// correct. Anything not listed is a general page: status 200 only.
const NAMES = {
  AT: ["austria"], AU: ["australia"], BD: ["bangladesh"], CA: ["canada"], DE: ["germany"],
  ES: ["spain"], FR: ["france"], GB: ["uk", "united kingdom"], IE: ["ireland"], IN: ["india"],
  IT: ["italy"], MX: ["mexico"], NL: ["netherlands"], PH: ["philippines"],
  PT: ["portugal"], US: ["usa", "united states", "u.s."], VN: ["vietnam"], ZA: ["south africa"],
};
const isGeneral = (url) =>
  /moneygram\.com\/[a-z]{2}\/en$/.test(url) ||
  /paysend\.com\/en-[a-z]{2}$/.test(url) ||
  /paypal\.com\//.test(url) ||
  /westernunion\.com/.test(url);

let failed = 0, unchecked = 0, passed = 0;
for (const [url, { r }] of links) {
  let line;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(25000) });
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim();
    if (res.status === 403 || res.status === 429) {
      line = ["UNCHECKED", `${res.status} (bot-blocked)`]; unchecked++;
    } else if (!res.ok) {
      line = ["FAIL", `HTTP ${res.status}`]; failed++;
    } else if (/not found|404/i.test(title)) {
      line = ["FAIL", `title "${title}"`]; failed++;
    } else if (isGeneral(url)) {
      // WU/MoneyGram/PayPal pages render their content client-side: a 200 on
      // the right path is all plain HTTP can confirm.
      line = [title ? "PASS" : "UNCHECKED", title ? `200 "${title.slice(0, 60)}"` : "200, no title (client-rendered)"];
      if (title) passed++;
      else unchecked++;
    } else {
      const names = NAMES[r.receiveCountry] ?? [];
      const ok = names.some((n) => title.toLowerCase().includes(n));
      line = [ok ? "PASS" : "FAIL", `"${title.slice(0, 70)}"`];
      if (ok) passed++;
      else failed++;
    }
  } catch (err) {
    line = ["FAIL", String(err.message ?? err)]; failed++;
  }
  console.log(`${line[0].padEnd(9)} ${r.provider.padEnd(13)} ${url}\n          ${line[1]}`);
}
console.log(`\n${links.size} distinct links: ${passed} pass, ${unchecked} unchecked, ${failed} fail`);
if (failed) process.exitCode = 1;
