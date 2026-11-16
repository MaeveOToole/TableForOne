import { z } from 'zod';
// PostgreSQL UUID columns also contain legacy md5-based identifiers. They are
// valid 128-bit database IDs, without RFC version/variant bits. Keep their identity.
export const recordIdSchema = z.guid();
