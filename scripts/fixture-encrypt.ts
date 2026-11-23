// Test helper: encrypts a sample message to the public key given as argv[2] and prints the row the
// inbound function would store. Run with: node scripts/fixture-encrypt.ts <base64 public key>
import { encryptMessage } from '../src/lib/crypto/envelope.ts';
import { fromBase64 } from '../src/lib/crypto/bytes.ts';

const enc = encryptMessage(
  {
    sender: 'Ada Lovelace',
    senderEmail: 'ada@example.org',
    avatarColor: '#8B5CF6',
    subject: 'Quarterly numbers FIXTURE-SUBJECT',
    preview: 'Hi Jane, the numbers are attached.',
    body: '<p>Hi Jane, FIXTURE-BODY-TEXT</p>',
    category: 'primary',
    to: ['jane@typhoonpost.com'],
    cc: [],
    attachments: [{ name: 'q3-budget.xlsx', size: '24 KB', kind: 'sheet' }],
  },
  fromBase64(process.argv[2]),
);
console.log(
  JSON.stringify({
    id: '00000000-0000-0000-0000-0000000000aa',
    sender: '', sender_email: '', avatar_color: '', subject: '', preview: '', body: '',
    folder: 'inbox', labels: [], category: 'primary', read: false, starred: false, has_replies: false,
    snoozed_until: null, created_at: new Date().toISOString(), to_addresses: [], attachments: [],
    enc_version: enc.version, enc_payload: enc.payload, enc_key: enc.key, size_bytes: 1234,
  }),
);
