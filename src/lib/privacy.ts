import DOMPurify, { type Config } from 'dompurify';

/**
 * Privacy engine for incoming mail.
 *
 * - Remote images are blocked until the reader asks for them (they tell the sender when and where
 *   a message was opened). When allowed they are fetched through our image proxy, so the sender
 *   never sees the reader's IP address.
 * - Known tracking pixels are removed outright, even when images are allowed.
 * - Tracking parameters are stripped from links, and links whose text points at one site while
 *   the destination is another are flagged.
 */

export interface PrivacyReport {
  remoteImages: number;
  trackersBlocked: number;
  linksCleaned: number;
  suspiciousLinks: number;
}

export interface ProcessedMail {
  html: string;
  report: PrivacyReport;
}

const TRACKING_PARAM =
  /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|twclid|igshid|mc_eid|mc_cid|_hsenc|_hsmi|__hssc|__hstc|hsctatracking|mkt_tok|oly_enc_id|oly_anon_id|vero_id|vero_conv|trk|trkcampaign|trkemail|s_cid|ref_|spm|sr_share|ck_subscriber_id|elqtrack|elqtrackid|rb_clickid|_ga|_gl|cid|ncid|piwik_campaign|piwik_kwd|pk_campaign|pk_kwd|ss_source|ss_campaign_id|ss_email_id)$/i;

const TRACKER_HOSTS = [
  'doubleclick.net',
  'google-analytics.com',
  'googletagmanager.com',
  'list-manage.com',
  'mandrillapp.com',
  'mailchimp.com',
  'sendgrid.net',
  'hubspot.com',
  'hs-analytics.net',
  'hsforms.com',
  'mixpanel.com',
  'segment.io',
  'customer.io',
  'customeriomail.com',
  'intercom-mail.com',
  'mailgun.org',
  'sparkpostmail.com',
  'sendinblue.com',
  'brevo.com',
  'klaviyo.com',
  'klclick.com',
  'convertkit.com',
  'ck.page',
  'mailerlite.com',
  'getresponse.com',
  'activecampaign.com',
  'marketo.com',
  'mktoresp.com',
  'eloqua.com',
  'pardot.com',
  'salesforce.com',
  'exacttarget.com',
  'e.mail.salesforce.com',
  'bytro.com',
  'litmus.com',
  'emltrk.com',
  'mailtrack.io',
  'yesware.com',
  'streak.com',
  'superhuman.com',
  'bananatag.com',
  'mailfoogae.appspot.com',
  'returnpath.net',
  'rs6.net',
  'constantcontact.com',
  'ccmail.net',
  'facebook.com',
  'linkedin.com/emimp',
];

const TRACKER_PATH = /(\/(open|o|opens?|track|tracking|pixel|px|beacon|wf\/open|e\/o|trk|impression)(\/|\.|\?|$)|[?&](open|track|pixel)=|\.gif\?.*(id|uid|e|c)=)/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isTrackerHost(host: string): boolean {
  return TRACKER_HOSTS.some((h) => !h.includes('/') && (host === h || host.endsWith('.' + h)));
}

function dimension(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function looksLikeTrackingPixel(img: Element, src: string): boolean {
  const w = dimension(img.getAttribute('width'));
  const h = dimension(img.getAttribute('height'));
  if ((w !== null && w <= 2) || (h !== null && h <= 2)) return true;
  const host = hostOf(src);
  if (isTrackerHost(host) && TRACKER_PATH.test(src)) return true;
  return TRACKER_PATH.test(src) && /(^|\.)(track|trk|pixel|email|click|links?|e|mail|open|beacon)\./.test(host);
}

/** Remove tracking parameters. Returns the cleaned URL and how many parameters were removed. */
export function cleanUrl(href: string): { url: string; removed: number } {
  try {
    const u = new URL(href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { url: href, removed: 0 };
    let removed = 0;
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) {
        u.searchParams.delete(key);
        removed++;
      }
    }
    return { url: removed ? u.toString() : href, removed };
  } catch {
    return { url: href, removed: 0 };
  }
}

function registrable(host: string): string {
  const parts = host.replace(/^www\./, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const twoPartTld = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoPartTld ? -3 : -2).join('.');
}

/** If a link's visible text is itself a web address that differs from where it goes, return that host. */
function shownHost(text: string): string | null {
  const t = text.trim();
  const m = t.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#:]|$)/i);
  return m ? m[1].toLowerCase() : null;
}

const SANITIZE: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    'style', 'form', 'input', 'button', 'select', 'textarea', 'iframe', 'frame', 'object', 'embed', 'link',
    'meta', 'base', 'video', 'audio', 'source', 'track', 'picture', 'svg', 'math',
  ],
  FORBID_ATTR: ['style', 'srcset', 'background', 'poster', 'ping', 'formaction'],
  ADD_ATTR: ['target'],
};

export function processMail(rawHtml: string, opts: { allowImages: boolean }): ProcessedMail {
  const report: PrivacyReport = { remoteImages: 0, trackersBlocked: 0, linksCleaned: 0, suspiciousLinks: 0 };
  const clean = String(DOMPurify.sanitize(rawHtml, SANITIZE));
  const doc = new DOMParser().parseFromString(clean, 'text/html');

  doc.querySelectorAll('img').forEach((img) => {
    const src = (img.getAttribute('src') ?? '').trim();
    if (/^data:image\/(png|jpe?g|gif|webp|avif);/i.test(src)) return; // embedded: nothing to fetch
    if (!/^https?:\/\//i.test(src)) {
      img.remove(); // cid:, javascript:, protocol-relative and anything odd
      return;
    }
    if (looksLikeTrackingPixel(img, src)) {
      report.trackersBlocked++;
      img.remove();
      return;
    }
    report.remoteImages++;
    img.removeAttribute('src');
    img.removeAttribute('loading');
    img.setAttribute('data-remote-src', src);
    img.setAttribute('referrerpolicy', 'no-referrer');
    if (!opts.allowImages) {
      img.setAttribute('data-blocked', 'true');
      if (!img.getAttribute('alt')) img.setAttribute('alt', 'Image blocked');
    }
  });

  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!/^https?:\/\//i.test(href)) return;
    const { url, removed } = cleanUrl(href);
    if (removed) {
      report.linksCleaned++;
      a.setAttribute('href', url);
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer nofollow');
    a.setAttribute('referrerpolicy', 'no-referrer');
    const shown = shownHost(a.textContent ?? '');
    const dest = hostOf(url);
    if (shown && dest && registrable(shown) !== registrable(dest)) {
      report.suspiciousLinks++;
      a.setAttribute('data-suspicious', dest);
    }
  });

  return { html: doc.body.innerHTML, report };
}

// ---- Always-allow list (per sender, kept on this device) ----
const KEY = 'typhoonpost:allow-images';

export function allowedSenders(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function isSenderAllowed(email: string): boolean {
  return allowedSenders().includes(email.toLowerCase());
}

export function setSenderAllowed(email: string, allowed: boolean): void {
  const set = new Set(allowedSenders());
  if (allowed) set.add(email.toLowerCase());
  else set.delete(email.toLowerCase());
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* storage unavailable: the choice simply lasts for this message */
  }
}
