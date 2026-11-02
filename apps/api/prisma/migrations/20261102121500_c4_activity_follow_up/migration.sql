-- C4 ACT-003: explicit follow-up activity type.

ALTER TYPE "activity_type" ADD VALUE IF NOT EXISTS 'FOLLOW_UP';
