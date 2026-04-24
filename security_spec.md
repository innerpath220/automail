# Security Specification - LeadGenius AI

## Data Invariants
- A user can only access their own settings and campaigns.
- SMTP settings must have valid hosts and non-empty users/passes.
- Campaign data must be linked to the creator.

## The Dirty Dozen Payloads (Rejection Tests)
1. Write SMTP settings to another user's path.
2. Read SMTP settings of another user.
3. Create a campaign without a goal.
4. Update a campaign's `userId` to someone else.
5. Inject 1MB string into `smtpHost`.
6. Write to `/users/{userId}/settings/smtp` with extra "ghost" fields.
7. Access settings without being authenticated.
8. Access settings with an unverified email (if we enforce verification).
9. Delete another user's campaign.
10. Create a user setting with an invalid port type.
11. List all users (blanket read).
12. Update `originalOwnerId` (if it was immutable).

## Test Runner (Draft)
A `firestore.rules.test.ts` will be implemented to verify these.
