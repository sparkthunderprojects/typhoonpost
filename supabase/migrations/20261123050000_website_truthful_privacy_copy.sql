-- Make the public website's privacy claims match what the product actually does.

delete from public.site_features where section = 'security';

insert into public.site_features (section, eyebrow, title, body, icon, sort_order) values
('security','Tracker blocking','Senders cannot see when you open their mail','Remote images stay hidden until you choose to load them, and known tracking pixels are removed outright. When you do load an image it is fetched through our server, so the sender sees us, not your IP address or browser.','eye',1),
('security','Clean links','Tracking is stripped from every link','Tracking parameters such as utm_ and fbclid are removed from links before you click. If a link says one address but goes to another, we mark it and ask before you open it.','shield',2),
('security','Two-factor sign-in','An authenticator code on top of your password','Turn on a one-time code from any authenticator app. It is enforced by the database itself, so a stolen password alone cannot open your mail.','lock',3),
('security','Isolated accounts','Your mail is locked to your account','Every message, contact and event belongs to one account, and access rules run inside the database. A bug in the app cannot hand one customer another customer''s mail.','badge',4),
('security','Your data, your call','Export everything, delete everything','Download all your mail, contacts and calendar as one file whenever you like. Deleting your account removes your data, not just your access to it.','file',5),
('security','No ad business','We sell mailboxes, not attention','There is no ad profile built from your messages. Typhoonpost is paid for by the people who use it.','globe',6);

update public.site_faqs set answer =
 'Messages are stored per account behind database-level access rules, so other customers cannot open them, and connections are encrypted with TLS. Today, mail is not yet end-to-end or zero-access encrypted at rest, which means the operators of the service can technically access stored mail. We do not read it, and we are working toward encryption that removes that access. You can read exactly what we log and keep on our privacy page.'
 where question = 'Who can read my email?';

update public.site_faqs set answer =
 'No. Typhoonpost does not build ad profiles from your messages and does not sell your data. Remote images and tracking pixels in incoming mail are blocked by default, and you can export or delete your data at any time.'
 where question = 'Do you show ads or sell my data?';
