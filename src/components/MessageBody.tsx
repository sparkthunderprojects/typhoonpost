import { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, ImageOff, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { processMail, isSenderAllowed, setSenderAllowed } from '@/lib/privacy';
import { loadImageViaProxy } from '@/lib/imageProxy';

interface MessageBodyProps {
  html: string;
  senderEmail: string;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Renders one message's HTML with tracker blocking, a privacy report and link protection. */
export function MessageBody({ html, senderEmail }: MessageBodyProps) {
  const [allowed, setAllowed] = useState(() => isSenderAllowed(senderEmail));
  const [failed, setFailed] = useState(0);
  const [warn, setWarn] = useState<{ href: string; shown: string; dest: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const { html: safeHtml, report } = useMemo(() => processMail(html, { allowImages: allowed }), [html, allowed]);

  // Allowed images are fetched through the privacy proxy, never straight from the sender.
  useEffect(() => {
    setFailed(0);
    if (!allowed || !ref.current) return;
    let cancelled = false;
    ref.current.querySelectorAll<HTMLImageElement>('img[data-remote-src]').forEach((img) => {
      const remote = img.getAttribute('data-remote-src');
      if (!remote) return;
      loadImageViaProxy(remote)
        .then((url) => {
          if (!cancelled) img.src = url;
        })
        .catch(() => {
          if (cancelled) return;
          img.setAttribute('data-blocked', 'true');
          setFailed((n) => n + 1);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, safeHtml]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    const dest = a?.getAttribute('data-suspicious');
    if (a && dest) {
      e.preventDefault();
      setWarn({ href: a.getAttribute('href') ?? '', shown: (a.textContent ?? '').trim(), dest });
    }
  };

  const bits: string[] = [];
  if (report.trackersBlocked) bits.push(`${plural(report.trackersBlocked, 'tracker', 'trackers')} blocked`);
  if (report.linksCleaned) bits.push(`${plural(report.linksCleaned, 'link', 'links')} cleaned`);
  const summary = bits.length ? bits.join(', ') : 'No trackers found';

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-bg px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-success" title="Typhoonpost privacy report for this message">
          <ShieldCheck className="h-3.5 w-3.5" />
          {summary}
        </span>
        {report.remoteImages > 0 && !allowed && (
          <span className="flex flex-wrap items-center gap-2 text-fg-muted">
            <ImageOff className="h-3.5 w-3.5" />
            {plural(report.remoteImages, 'image', 'images')} hidden to stop senders tracking you
            <button
              onClick={() => setAllowed(true)}
              className="rounded-md border border-line px-2 py-0.5 font-medium text-fg hover:border-accent hover:text-accent"
            >
              Load images
            </button>
            <button
              onClick={() => {
                setSenderAllowed(senderEmail, true);
                setAllowed(true);
              }}
              className="rounded-md px-2 py-0.5 font-medium text-accent hover:bg-accent-soft"
            >
              Always load from this sender
            </button>
          </span>
        )}
        {report.remoteImages > 0 && allowed && (
          <span className="flex flex-wrap items-center gap-2 text-fg-muted">
            <ImageIcon className="h-3.5 w-3.5" />
            Images load through Typhoonpost, so the sender can't see your address
            {failed > 0 && <span className="text-warning">({failed} could not load)</span>}
            <button
              onClick={() => {
                setSenderAllowed(senderEmail, false);
                setAllowed(false);
              }}
              className="rounded-md px-2 py-0.5 font-medium text-accent hover:bg-accent-soft"
            >
              Hide images
            </button>
          </span>
        )}
        {report.suspiciousLinks > 0 && (
          <span className="flex items-center gap-1.5 text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            {plural(report.suspiciousLinks, 'link', 'links')} may not go where they say
          </span>
        )}
      </div>

      <div
        ref={ref}
        onClick={onClick}
        className="email-body mt-5 text-sm leading-relaxed text-fg"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />

      {warn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="link-warning-title"
          onClick={() => setWarn(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-bg-subtle p-5 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="link-warning-title" className="flex items-center gap-2 text-base font-semibold text-fg">
              <AlertTriangle className="h-5 w-5 text-warning" /> This link goes somewhere else
            </h2>
            <p className="mt-3 text-sm text-fg-muted">
              The link is shown as <strong className="text-fg break-all">{warn.shown}</strong>, but it opens{' '}
              <strong className="text-fg break-all">{warn.dest}</strong>. Messages that do this are often used to
              steal passwords.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                autoFocus
                onClick={() => setWarn(null)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
              >
                Don't open
              </button>
              <button
                onClick={() => {
                  window.open(warn.href, '_blank', 'noopener,noreferrer');
                  setWarn(null);
                }}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg hover:bg-bg-muted"
              >
                Open anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
