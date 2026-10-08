// "Eurozone" is the one send-side name that isn't a country -- it's a
// currency area standing in for eight countries (see lib/fx.ts). Everywhere
// else wants the bare name ("Eurozone" in a dropdown, a section header, a
// page's <h1>); prose needs the grammatical article ("from the Eurozone",
// the way "from France" doesn't take one). One place for that distinction so
// the homepage and the corridor page can't drift into naming it differently.
//
// Its own module (not lib/corridors.ts) so client components can use it
// without bundling the whole data file into the browser.
export function withArticle(countryName: string): string {
  return countryName === "Eurozone" ? "the Eurozone" : countryName;
}

// Country names that take "the" mid-sentence ("from the United States", "to the
// Philippines"). Broader than withArticle, which only covers the one send-side
// name that isn't a country, because it is for running prose only: a heading
// or a dropdown wants the bare name ("United States -> India"), so those keep
// using the bare name or withArticle. The names are the sendCountryName /
// receiveCountryName values in data/provider-data.json.
const TAKES_THE = new Set(["United States", "United Kingdom", "Eurozone", "Netherlands", "Philippines"]);

export function inProse(countryName: string): string {
  return TAKES_THE.has(countryName) ? `the ${countryName}` : countryName;
}
