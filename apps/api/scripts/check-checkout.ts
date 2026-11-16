import { createClient } from '@supabase/supabase-js';
// Read-only: confirm the hosted function exists and stays private.
const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  },
);
const { error } = await db.rpc('checkout_document', { p_week: '2026-11-02' });
if (error?.code === '42501')
  console.log(
    'PASS: hosted weekly checkout function exists and denies anonymous access. Signed-in spending acceptance remains required.',
  );
else {
  console.error(
    ['PGRST202', '42883'].includes(error?.code || '')
      ? 'Weekly checkout upgrade has not been activated.'
      : 'Weekly checkout privacy check could not be confirmed.',
  );
  console.error(
    `Diagnostic code: ${error?.code || 'TRANSPORT_OR_UNEXPECTED_RESPONSE'}`,
  );
  process.exitCode = 1;
}
