import assert from "node:assert/strict";
import { test } from "node:test";
import { consentToken, setConsentPeriod } from "./consentPeriod.ts";
import { noteQuoteLink, noteSelectedTabUrlsCopied, noteUrlCopied, takeUrlCopyCounts } from "./urlCopies.ts";

test("address copies are counted, those taken before the first page apart, and taking them starts over", () => {
  noteUrlCopied(false);
  noteUrlCopied(true);
  noteUrlCopied(true);
  noteSelectedTabUrlsCopied();
  assert.deepEqual(takeUrlCopyCounts(), { url_copies: 4, url_copies_while_pending: 2, url_copies_of_selected_tabs: 1, quote_links: 0, quote_links_not_made: 0 });
  assert.deepEqual(takeUrlCopyCounts(), { url_copies: 0, url_copies_while_pending: 0, url_copies_of_selected_tabs: 0, quote_links: 0, quote_links_not_made: 0 });
});

test("quote links are counted made and not made, only while sharing is on", () => {
  setConsentPeriod(true, "quote-links");
  noteQuoteLink(true, consentToken());
  noteQuoteLink(false, consentToken());
  setConsentPeriod(false, null);
  noteQuoteLink(true, consentToken());
  const { quote_links, quote_links_not_made } = takeUrlCopyCounts();
  assert.deepEqual([quote_links, quote_links_not_made], [1, 1]);
});
