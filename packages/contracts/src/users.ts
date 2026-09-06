import { z } from 'zod';

/** Users module DTOs (§40). Avatar upload is Phase 2. */
export const UpdateMeInput = z
  .object({
    name: z.string().min(2).max(80).optional(),
    email: z.string().email().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Kamida bitta maydon kerak' });

export const UserDTO = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  avatar: z.string().nullable(),
  role: z.enum(['USER', 'ADMIN']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']),
  isPhoneVerified: z.boolean(),
  canListProperties: z.boolean(),
  createdAt: z.coerce.date(),
});

export type UpdateMeInputT = z.infer<typeof UpdateMeInput>;
export type UserDTOT = z.infer<typeof UserDTO>;
