import { z } from 'zod';

export function recoveryCredential(value: string, supabaseUrl: string) {
  const input = value.trim();
  if (/^\d{6,10}$/.test(input)) return { token: input };
  const url = new URL(input);
  const trusted = new URL(supabaseUrl);
  if (
    url.origin !== trusted.origin ||
    url.pathname !== '/auth/v1/verify' ||
    url.searchParams.get('type') !== 'recovery'
  )
    throw new Error('Use the recovery link or code from your email.');
  return {
    token_hash: z
      .string()
      .min(16)
      .max(512)
      .parse(
        url.searchParams.get('token_hash') || url.searchParams.get('token'),
      ),
  };
}
