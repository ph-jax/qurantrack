import { z } from 'zod';

export const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const utcTimestampSchema = z.string().datetime({ offset: true });
export const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const organizationSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string().min(1).max(160),
  logoUrl: z.string().url().startsWith('https://').nullable().optional(),
  logoDataUrl: z.string().startsWith('data:image/').max(200_000).nullable().optional(),
  primaryColor: hexColorSchema,
  defaultLocale: z.string().min(2).max(16),
  timezone: z.string().min(1).max(64),
  emailSenderName: z.string().min(1).max(120),
  emailReplyTo: emailSchema,
  reportTitle: z.string().min(1).max(160),
  missingUpdateDays: z.number().int().positive(),
  guardianTokenLifetimeDays: z.number().int().positive(),
  active: z.boolean(),
});

export const membershipRoleSchema = z.enum([
  'system_admin',
  'organization_admin',
  'teacher',
  'read_only',
]);
export const membershipSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  userId: idSchema,
  role: membershipRoleSchema,
  active: z.boolean(),
});

export const trackSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});
export const levelSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  trackId: idSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});
export const lessonSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  levelId: idSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  defaultHomework: z.string().nullable().optional(),
  active: z.boolean(),
});
export const classSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  meetingSchedule: z.string().nullable().optional(),
  active: z.boolean(),
});
export const studentSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  externalId: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  displayName: z.string().min(1),
  active: z.boolean(),
  notes: z.string().nullable().optional(),
});
export const guardianSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: z.string().min(1),
  email: emailSchema,
  phone: z.string().nullable().optional(),
  active: z.boolean(),
});
export const enrollmentSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  classId: idSchema,
  studentId: idSchema,
  active: z.boolean(),
  enrolledAt: utcTimestampSchema,
  withdrawnAt: utcTimestampSchema.nullable().optional(),
});
export const progressUpdateDraftSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  studentId: idSchema,
  classId: idSchema.nullable().optional(),
  teacherUserId: idSchema,
  updateDate: z.string().date(),
  overallComment: z.string().nullable().optional(),
  homework: z.string().nullable().optional(),
  status: z.literal('draft'),
});
export const progressOutcomeSchema = z.enum(['passed', 'practiced', 'needs_practice', 'assigned']);
export const progressUpdateItemSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  progressUpdateId: idSchema,
  trackId: idSchema,
  levelId: idSchema,
  lessonId: idSchema,
  outcome: progressOutcomeSchema,
  itemComment: z.string().nullable().optional(),
});
