import { createClient } from '@supabase/supabase-js';

// Read-only deployment check. No session, user data or credentials are printed.
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
const { error } = await db.rpc('kitchen_ready');
if (error?.code === '42501') {
  console.log(
    'PASS: hosted kitchen readiness function exists and denies anonymous access.',
  );
  console.log(
    'Signed-in pantry, regular purchases and meal lock acceptance still required.',
  );
} else {
  console.error(
    error?.code === 'PGRST202' || error?.code === '42883'
      ? 'Kitchen readiness function is not available in this database.'
      : 'Kitchen check did not confirm the expected anonymous denial.',
  );
  console.error(
    `Diagnostic code: ${error?.code || 'TRANSPORT_OR_UNEXPECTED_RESPONSE'}`,
  );
  process.exitCode = 1;
}
