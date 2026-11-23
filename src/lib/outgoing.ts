import { supabase } from '@/lib/supabase';
import { encryptMessage, type PayloadAttachment } from '@/lib/crypto/envelope';
import type { Email } from '@/types';
import { deliverLocal, insertEmail, lookupPublicKeys, sendViaResend, type LocalDelivery } from '@/lib/db';

const COLORS = ['#0F6CBD', '#0EA5E9', '#14B8A6', '#16A34A', '#F59E0B', '#EC4899', '#8B5CF6', '#DC2626'];
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

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

const REASONS: Record<string, string> = {
  unknown_recipient: 'that address no longer exists',
  no_keys: 'they have not finished setting up their mailbox',
  limit: 'the daily sending limit was reached',
  attachment_failed: 'the attachments could not be delivered',
  invalid: 'the message was rejected',
};

export interface SendOutcome {
  saved: Email;
  /** Addresses the message reached. */
  delivered: string[];
  failed: { address: string; reason: string }[];
}

interface SendArgs {
  userId: string;
  myAddress: string;
  to: string;
  subject: string;
  body: string;
  attachments?: PayloadAttachment[];
}

/**
 * Saves an encrypted copy to Sent Items, then delivers. Recipients on Typhoonpost get a copy the
 * browser encrypts to their own key (it never passes through an outside mail provider). Everyone
 * else goes through the mail provider, which has to see the message to send it.
 */
export async function sendMessage({ userId, myAddress, to, subject, body, attachments = [] }: SendArgs): Promise<SendOutcome> {
  const recipients = parseRecipients(to);
  const preview = body.replace(/<[^>]+>/g, '').slice(0, 120) || '(no content)';

  // Saved first so it survives even if delivery fails.
  const saved = await insertEmail(userId, {
    sender: 'You',
    senderEmail: myAddress,
    avatarColor: '#0F6CBD',
    subject,
    preview,
    body,
    read: true,
    starred: false,
    folder: 'sent',
    labels: [],
    category: 'primary',
    toAddresses: recipients,
    payloadAttachments: attachments,
  });

  const delivered: string[] = [];
  const failed: SendOutcome['failed'] = [];

  // If keys cannot be checked, stop rather than risk sending a local recipient's copy in the clear.
  let keys: Map<string, Uint8Array>;
  try {
    keys = await lookupPublicKeys(recipients);
  } catch {
    return {
      saved,
      delivered,
      failed: recipients.map((address) => ({ address, reason: 'we could not check who is on Typhoonpost, so nothing was sent' })),
    };
  }

  const local = recipients.filter((r) => keys.has(r));
  let external = recipients.filter((r) => !keys.has(r));

  // Files are stored encrypted for Typhoonpost recipients only. The outside mail path carries
  // message text, not files, so say so instead of sending the message without them.
  if (attachments.length && external.length) {
    for (const address of external) {
      failed.push({ address, reason: 'attachments can only be sent to Typhoonpost addresses for now. Send it again without the attachment' });
    }
    external = [];
  }

  if (local.length) {
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    const senderName = String(profile?.display_name ?? '').trim() || myAddress.split('@')[0];
    const deliveries: LocalDelivery[] = local.map((address) => {
      const enc = encryptMessage(
        {
          sender: senderName,
          senderEmail: myAddress,
          avatarColor: colorFor(myAddress),
          subject,
          preview,
          body,
          category: 'primary',
          to: recipients,
          cc: [],
          attachments,
        },
        keys.get(address)!,
      );
      return {
        address,
        version: enc.version,
        payload: enc.payload,
        key: enc.key,
        size: body.length,
        files: attachments.flatMap((a) => (a.file ? [a.file.id] : [])),
      };
    });
    try {
      for (const r of await deliverLocal(deliveries)) {
        if (r.ok) delivered.push(r.address);
        else failed.push({ address: r.address, reason: REASONS[r.error ?? ''] ?? 'delivery failed' });
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'delivery failed';
      for (const address of local) failed.push({ address, reason });
    }
  }

  if (external.length) {
    try {
      await sendViaResend({ to: external.join(', '), subject, html: body });
      delivered.push(...external);
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'delivery failed';
      for (const address of external) failed.push({ address, reason });
    }
  }

  return { saved, delivered, failed };
}
