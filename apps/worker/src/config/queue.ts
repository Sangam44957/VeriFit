import { z } from 'zod';

export const QUEUE_NAMES = {
  VERIFICATION_GITHUB: 'verification:github',
  VERIFICATION_CODEFORCES: 'verification:codeforces',
  VERIFICATION_LEETCODE: 'verification:leetcode',
  RESUME_PARSE: 'resume:parse',
  JD_EXTRACT: 'jd:extract',
  CAPABILITY_CALCULATE: 'capability:calculate',
  SCORE_CALCULATE: 'score:calculate',
  RANKING_CALCULATE: 'ranking:calculate',
  EXPORT_CREATE: 'export:create',
  NOTIFICATION_SEND: 'notification:send',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ---------------------------------------------------------------------------
// Job data schemas — one per queue. Consumers must validate incoming data
// against these schemas before processing.
// ---------------------------------------------------------------------------

export const JobSchemas = {
  [QUEUE_NAMES.VERIFICATION_GITHUB]: z.object({
    candidateId: z.string().uuid(),
    githubUsername: z.string().min(1),
  }),
  [QUEUE_NAMES.VERIFICATION_CODEFORCES]: z.object({
    candidateId: z.string().uuid(),
    codeforcesHandle: z.string().min(1),
  }),
  [QUEUE_NAMES.VERIFICATION_LEETCODE]: z.object({
    candidateId: z.string().uuid(),
    leetcodeUsername: z.string().min(1),
  }),
  [QUEUE_NAMES.RESUME_PARSE]: z.object({
    candidateId: z.string().uuid(),
    resumeStorageKey: z.string().min(1),
  }),
  [QUEUE_NAMES.JD_EXTRACT]: z.object({
    jobDescriptionId: z.string().uuid(),
  }),
  [QUEUE_NAMES.CAPABILITY_CALCULATE]: z.object({
    candidateId: z.string().uuid(),
  }),
  [QUEUE_NAMES.SCORE_CALCULATE]: z.object({
    candidateId: z.string().uuid(),
    jobDescriptionId: z.string().uuid(),
  }),
  [QUEUE_NAMES.RANKING_CALCULATE]: z.object({
    jobDescriptionId: z.string().uuid(),
  }),
  [QUEUE_NAMES.EXPORT_CREATE]: z.object({
    exportId: z.string().uuid(),
    format: z.enum(['csv', 'pdf']),
  }),
  [QUEUE_NAMES.NOTIFICATION_SEND]: z.object({
    recipientId: z.string().uuid(),
    templateId: z.string().min(1),
    payload: z.record(z.unknown()),
  }),
} satisfies Record<QueueName, z.ZodTypeAny>;

export type JobData<Q extends QueueName> = z.infer<(typeof JobSchemas)[Q]>;
