// Delivers browser-encrypted messages to other Typhoonpost users. See handler.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, handleDeliver, type Caller, type DeliverDb } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const db: DeliverDb = {
  async findRecipient(address) {
    const { data: box, error } = await admin.from('mailboxes').select('user_id').eq('address', address).maybeSingle();
    if (error) throw new Error(error.message);
    if (!box) return null;
    const { data: keys, error: keyErr } = await admin.from('user_keys').select('public_key').eq('user_id', box.user_id).maybeSingle();
    if (keyErr) throw new Error(keyErr.message);
    return { user_id: box.user_id, public_key: keys?.public_key ?? null };
  },
  async countDeliveriesSince(userId, sinceIso) {
    const { count, error } = await admin
      .from('delivery_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', sinceIso);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async insertEmail(row) {
    const { error } = await admin.from('emails').insert(row);
    if (error) throw new Error(error.message);
  },
  async copyFile(fromPath, toPath) {
    const { error } = await admin.storage.from('attachments').copy(fromPath, toPath);
    if (error) throw new Error(error.message);
  },
  async logDelivery(userId) {
    const { error } = await admin.from('delivery_log').insert({ user_id: userId });
    if (error) throw new Error(error.message);
  },
};

async function callerFrom(req: Request): Promise<Caller | null> {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await userClient.auth.getUser();
  if (!data?.user) return null;
  // The sender's address comes from our records, never from the request.
  const { data: box } = await admin.from('mailboxes').select('address').eq('user_id', data.user.id).maybeSingle();
  return box?.address ? { userId: data.user.id, address: box.address } : null;
}

Deno.serve(async (req) => {
  try {
    const caller = req.method === 'POST' ? await callerFrom(req) : null;
    return await handleDeliver(req, caller, db);
  } catch (e) {
    console.error('deliver-local failed:', e instanceof Error ? e.message : 'unknown error');
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
