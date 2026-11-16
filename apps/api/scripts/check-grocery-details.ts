import { createClient } from '@supabase/supabase-js';
// Read-only deployment verification, without printing credentials or user data.
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
const { error } = await db.rpc('grocery_details_ready');
if (error?.code === '42501')
  console.log(
    'PASS: grocery-details readiness function exists and denies anonymous access. Signed-in edit/reload acceptance remains required.',
  );
else {
  console.error(
    ['PGRST202', '42883'].includes(error?.code || '')
      ? 'Grocery-details upgrade has not been activated.'
      : 'Grocery-details privacy check could not be confirmed.',
  );
  console.error(
    `Diagnostic code: ${error?.code || 'TRANSPORT_OR_UNEXPECTED_RESPONSE'}`,
  );
  process.exitCode = 1;
}
