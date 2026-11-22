import type { ConsentToken } from "./choice";
import { countFor } from "./countFor";

let copies = 0;
let quoteLinks = 0;
let quoteLinksNotMade = 0;
let whilePending = 0;
let selectedTabs = 0;

export function noteSelectedTabUrlsCopied() {
  copies++;
  selectedTabs++;
}

export function noteUrlCopied(firstPagePending: boolean) {
  copies++;
  if (firstPagePending) whilePending++;
}

export function noteQuoteLink(made: boolean, consent: ConsentToken | null) {
  countFor(consent, () => void (made ? quoteLinks++ : quoteLinksNotMade++));
}

export function takeUrlCopyCounts() {
  const taken = { url_copies: copies, url_copies_while_pending: whilePending, url_copies_of_selected_tabs: selectedTabs, quote_links: quoteLinks, quote_links_not_made: quoteLinksNotMade };
  copies = 0;
  whilePending = 0;
  selectedTabs = 0;
  quoteLinks = 0;
  quoteLinksNotMade = 0;
  return taken;
}
