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
