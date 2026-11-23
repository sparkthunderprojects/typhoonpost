import type { Email } from '@/types';

export const initialEmails: Email[] = [
  {
    id: 'e1',
    sender: 'Linear',
    senderEmail: 'updates@linear.app',
    avatarColor: '#5E6AD2',
    initials: 'LN',
    subject: 'Your weekly project velocity is up 18%',
    preview:
      'Great news — your team shipped 23 issues this week, a notable jump from last. Here’s a breakdown of cycle time and throughput trends…',
    body: `
      <p>Hi there,</p>
      <p>Great news — <strong>Apollo</strong> shipped <strong>23 issues</strong> this week, an 18% jump in velocity versus last week. Cycle time dropped to a median of <strong>1.8 days</strong>.</p>
      <h2>This week at a glance</h2>
      <ul>
        <li>23 issues completed (↑18%)</li>
        <li>4 issues carried over</li>
        <li>0 issues marked urgent</li>
      </ul>
      <blockquote>Tip: Group related issues into a project to get a rolled-up burndown chart on your dashboard.</blockquote>
      <p>Review the full report in your workspace, and consider adjusting the next cycle’s scope to keep momentum.</p>
      <p>— The Linear Team</p>
    `,
    timestamp: '9:41 AM',
    date: 'Today',
    read: false,
    starred: true,
    folder: 'inbox',
    labels: ['work'],
    category: 'primary',
    attachments: [
      { id: 'a1', name: 'velocity-report.pdf', size: '1.2 MB', kind: 'pdf' },
    ],
  },
  {
    id: 'e2',
    sender: 'Maya Chen',
    senderEmail: 'maya@studio.design',
    avatarColor: '#0EA5E9',
    initials: 'MC',
    subject: 'Re: Onboarding flow — latest mocks',
    preview:
      'I pushed v4 of the onboarding sequence. The progress indicator is now sticky and we added a celebratory micro-animation on step 3…',
    body: `
      <p>Hey,</p>
      <p>I pushed <strong>v4 of the onboarding sequence</strong>. A few things changed based on yesterday’s review:</p>
      <ul>
        <li>Progress indicator is now sticky at the top</li>
        <li>Added a celebratory micro-animation on step 3 completion</li>
        <li>Tightened copy on the permissions screen</li>
      </ul>
      <p>The celebratory moment is subtle — a soft confetti burst that fades in 600ms. Let me know if it reads too playful for the brand.</p>
      <img src="https://images.unsplash.com/photo-1545235617-9465d5a42d3e?w=600&q=80" alt="Onboarding mock" style="width:100%;max-width:560px" />
      <p>Files are attached. I’m around for a quick sync after 2pm if useful.</p>
      <p>Best,<br/>Maya</p>
    `,
    timestamp: '8:52 AM',
    date: 'Today',
    read: false,
    starred: false,
    folder: 'inbox',
    labels: ['work', 'urgent'],
    category: 'primary',
    attachments: [
      { id: 'a2', name: 'onboarding-v4.fig', size: '8.4 MB', kind: 'doc' },
      { id: 'a3', name: 'step3-motion.mp4', size: '3.1 MB', kind: 'image' },
    ],
    hasReplies: true,
  },
  {
    id: 'e3',
    sender: 'GitHub Security',
    senderEmail: 'noreply@github.com',
    avatarColor: '#1F2328',
    initials: 'GH',
    subject: '[Security alert] New sign-in to your account',
    preview:
      'We noticed a new sign-in to your account from a device we haven’t seen before. If this was you, no action is needed…',
    body: `
      <p>Hi,</p>
      <p>We noticed a <strong>new sign-in</strong> to your account from a device we haven’t seen before.</p>
      <blockquote>
        <strong>Device:</strong> MacBook Pro · Safari<br/>
        <strong>Location:</strong> San Francisco, CA, US<br/>
        <strong>Time:</strong> Aug 1, 2026, 7:14 AM PDT
      </blockquote>
      <p>If this was you, no action is needed. If you don’t recognize this activity, someone may be trying to access your account. <a href="#">Secure your account</a> by resetting your password and reviewing your sessions.</p>
      <p>Thanks,<br/>GitHub Security</p>
    `,
    timestamp: '7:14 AM',
    date: 'Today',
    read: false,
    starred: false,
    folder: 'inbox',
    labels: ['urgent'],
    category: 'primary',
    attachments: [],
  },
  {
    id: 'e4',
    sender: 'Figma',
    senderEmail: 'team@figma.com',
    avatarColor: '#F24E1E',
    initials: 'FG',
    subject: 'Jordan commented on “Dashboard — Charts”',
    preview:
      'Jordan left 3 new comments on the Charts file. “Can we try a softer grid line here? The contrast is pulling focus from the data…”',
    body: `
      <p>Jordan left <strong>3 new comments</strong> on <strong>Dashboard — Charts</strong>.</p>
      <ol>
        <li>“Can we try a softer grid line here? The contrast is pulling focus from the data.”</li>
        <li>“Love the tooltip treatment — ship it.”</li>
        <li>“Should the empty state have an illustration?”</li>
      </ol>
      <p><a href="#">Open the file in Figma</a> to reply and resolve threads.</p>
    `,
    timestamp: 'Yesterday',
    date: 'Yesterday',
    read: true,
    starred: true,
    folder: 'inbox',
    labels: ['work'],
    category: 'primary',
    attachments: [],
  },
  {
    id: 'e5',
    sender: 'Stripe',
    senderEmail: 'receipts@stripe.com',
    avatarColor: '#635BFF',
    initials: 'ST',
    subject: 'Your July payout of $4,218.00 is on its way',
    preview:
      'We’ve initiated a payout of $4,218.00 to your bank account ending in 4421. It should arrive within 2 business days…',
    body: `
      <p>Hi,</p>
      <p>We’ve initiated a payout of <strong>$4,218.00</strong> to your bank account ending in <strong>4421</strong>. It should arrive within 2 business days.</p>
      <h2>Payout summary</h2>
      <ul>
        <li>Gross volume: $5,302.40</li>
        <li>Fees: $158.40</li>
        <li>Net payout: $4,218.00</li>
      </ul>
      <p><a href="#">View detailed report</a></p>
    `,
    timestamp: 'Yesterday',
    date: 'Yesterday',
    read: true,
    starred: false,
    folder: 'inbox',
    labels: ['finance'],
    category: 'primary',
    attachments: [
      { id: 'a5', name: 'payout-july.pdf', size: '420 KB', kind: 'pdf' },
    ],
  },
  {
    id: 'e6',
    sender: 'Mom',
    senderEmail: 'mom@family.net',
    avatarColor: '#EC4899',
    initials: 'MO',
    subject: 'Sunday dinner this weekend?',
    preview:
      'Hi sweetheart, are you free for dinner this Sunday? Dad’s making the lasagna you love. Let me know so we can plan around your schedule…',
    body: `
      <p>Hi sweetheart,</p>
      <p>Are you free for dinner this Sunday? Dad’s making the <strong>lasagna you love</strong> and we’d really like to see you.</p>
      <p>Let me know so we can plan around your schedule. No pressure if you’re busy — we can always do next week.</p>
      <p>Love you,<br/>Mom</p>
    `,
    timestamp: 'Wed',
    date: 'This week',
    read: true,
    starred: true,
    folder: 'inbox',
    labels: ['personal'],
    category: 'primary',
    attachments: [],
  },
  {
    id: 'e7',
    sender: 'Vercel',
    senderEmail: 'no-reply@vercel.com',
    avatarColor: '#000000',
    initials: 'VC',
    subject: 'Deployment ready: apollo-web (production)',
    preview:
      'Your deployment is live. Build completed in 42s with 0 errors. Preview the production deployment or promote to your custom domain…',
    body: `
      <p>Your deployment is <strong>live</strong>.</p>
      <ul>
        <li>Project: apollo-web</li>
        <li>Branch: main</li>
        <li>Build: completed in 42s</li>
        <li>Errors: 0</li>
      </ul>
      <p><a href="#">Preview production deployment</a></p>
    `,
    timestamp: 'Wed',
    date: 'This week',
    read: true,
    starred: false,
    folder: 'inbox',
    labels: ['work'],
    category: 'primary',
    attachments: [],
  },
  {
    id: 'e8',
    sender: 'Notion',
    senderEmail: 'team@notion.so',
    avatarColor: '#111111',
    initials: 'NO',
    subject: 'Weekly digest: 4 pages updated in your workspace',
    preview:
      'Here’s what changed in your workspace this week. The “Q3 Roadmap” page had the most activity with 12 edits across 4 editors…',
    body: `
      <p>Here’s what changed in your workspace this week.</p>
      <h2>Most active</h2>
      <ul>
        <li><strong>Q3 Roadmap</strong> — 12 edits, 4 editors</li>
        <li><strong>Design System</strong> — 6 edits</li>
        <li><strong>Meeting Notes</strong> — 3 edits</li>
      </ul>
      <p><a href="#">Open your digest in Notion</a></p>
    `,
    timestamp: 'Tue',
    date: 'This week',
    read: true,
    starred: false,
    folder: 'inbox',
    labels: ['personal'],
    category: 'social',
    attachments: [],
  },
  {
    id: 'e9',
    sender: 'Alex Rivera',
    senderEmail: 'alex@quilltech.io',
    avatarColor: '#14B8A6',
    initials: 'AR',
    subject: 'Quick question on the API contract',
    preview:
      'Hey — wanted to double check one thing on the v2 contract. Are we still returning a cursor string for pagination, or moving to offset…',
    body: `
      <p>Hey,</p>
      <p>Wanted to double check one thing on the <strong>v2 contract</strong>. Are we still returning a cursor string for pagination, or moving to offset-based now that we have stable IDs?</p>
      <p>This affects how the mobile client caches the feed, so I want to lock it before we cut the SDK release.</p>
      <p>Thanks,<br/>Alex</p>
    `,
    timestamp: 'Mon',
    date: 'This week',
    read: true,
    starred: false,
    folder: 'inbox',
    labels: ['work', 'urgent'],
    category: 'primary',
    attachments: [],
    hasReplies: true,
  },
  {
    id: 'e10',
    sender: 'Spotify',
    senderEmail: 'no-reply@spotify.com',
    avatarColor: '#1DB954',
    initials: 'SP',
    subject: 'Your 2026 mid-year Wrapped is ready',
    preview:
      'You listened to 14,302 minutes of music this year. Your top artist was Phoebe Bridgers and your top genre was indie folk…',
    body: `
      <p>You listened to <strong>14,302 minutes</strong> of music this year.</p>
      <ul>
        <li>Top artist: Phoebe Bridgers</li>
        <li>Top genre: Indie folk</li>
        <li>Top song: “Garden Song”</li>
      </ul>
      <p><a href="#">See your full Wrapped</a></p>
    `,
    timestamp: 'Mon',
    date: 'This week',
    read: true,
    starred: false,
    folder: 'inbox',
    labels: ['personal'],
    category: 'social',
    attachments: [],
  },
  {
    id: 'e11',
    sender: 'TechWeekly',
    senderEmail: 'deals@techweekly.io',
    avatarColor: '#F59E0B',
    initials: 'TW',
    subject: '⚡ 48-hour flash sale — 60% off Pro plans',
    preview:
      'This weekend only: upgrade to Pro and unlock unlimited workspaces, advanced analytics, and priority support at our lowest price ever…',
    body: `
      <p>Hi there,</p>
      <p>This weekend only — upgrade to <strong>Pro</strong> and unlock:</p>
      <ul>
        <li>Unlimited workspaces</li>
        <li>Advanced analytics</li>
        <li>Priority support</li>
      </ul>
      <p>At our <strong>lowest price ever</strong> — 60% off, this weekend only.</p>
      <p><a href="#">Claim your discount</a></p>
    `,
    timestamp: 'Mon',
    date: 'This week',
    read: false,
    starred: false,
    folder: 'inbox',
    labels: [],
    category: 'promotions',
    attachments: [],
  },
  {
    id: 'e12',
    sender: 'LinkedIn',
    senderEmail: 'invitations@linkedin.com',
    avatarColor: '#0A66C2',
    initials: 'LI',
    subject: 'You have 5 new connection requests',
    preview:
      'Jordan Lee, Priya Nair, and 3 others want to connect with you. See who you may know and grow your professional network…',
    body: `
      <p>You have <strong>5 new connection requests</strong> waiting.</p>
      <ul>
        <li>Jordan Lee — Product Designer at Studio</li>
        <li>Priya Nair — Engineering Manager at Quill</li>
        <li>3 more…</li>
      </ul>
      <p><a href="#">Review requests</a></p>
    `,
    timestamp: 'Mon',
    date: 'This week',
    read: false,
    starred: false,
    folder: 'inbox',
    labels: [],
    category: 'social',
    attachments: [],
  },
];
