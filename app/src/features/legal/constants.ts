/**
 * The two facts every legal page shares. One place, so the privacy policy, the terms, the support
 * page and the delete-account page can never disagree about who to write to or how current they are.
 */

/** The one address for privacy requests, support and account deletion by email. */
export const LEGAL_CONTACT = 'tomas@valiunas.dev';

/** Bump when the substance of any legal page changes (ISO date, shown as-is). */
export const LEGAL_LAST_UPDATED = '2026-09-23';

/** Backups (DynamoDB point-in-time recovery) roll off after this many days. */
export const BACKUP_RETENTION_DAYS = 35;
