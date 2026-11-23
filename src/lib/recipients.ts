/** "Ada <ada@x.org>, bob@y.com" → ["ada@x.org", "bob@y.com"], lower-cased and de-duplicated. */
export function parseRecipients(to: string): string[] {
  const out = new Set<string>();
  for (const part of to.split(/[,;]/)) {
    const m = part.match(/<([^>]+)>/);
    const addr = (m ? m[1] : part).trim().toLowerCase();
    if (addr) out.add(addr);
  }
  return [...out];
}

/** Splits To/Cc/Bcc into clean lists; an address only counts once, at its most visible level. */
export function splitRecipients(to: string, cc = '', bcc = '') {
  const toList = parseRecipients(to);
  const seen = new Set(toList);
  const ccList = parseRecipients(cc).filter((a) => !seen.has(a));
  ccList.forEach((a) => seen.add(a));
  const bccList = parseRecipients(bcc).filter((a) => !seen.has(a));
  return { toList, ccList, bccList, all: [...toList, ...ccList, ...bccList] };
}

