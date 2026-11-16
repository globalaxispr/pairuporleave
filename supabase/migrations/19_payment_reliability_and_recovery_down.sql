-- ============================================================================
-- Rollback Migration: 19_payment_reliability_and_recovery_down.sql
-- Non-destructive RPC rollback for 19_payment_reliability_and_recovery.sql
--
-- NOTE: Does NOT drop public.payment_events_log, public.payment_reconciliation_runs,
-- or additive columns on public.payments so that audit history, refund/dispute
-- records, and manual review flags are never destroyed during an application rollback.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_reconcilable_payments(integer, integer);
DROP FUNCTION IF EXISTS public.flag_payment_manual_review(uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS public.record_payment_reconciliation_attempt(uuid, text, text, timestamptz, boolean, text, jsonb);
DROP FUNCTION IF EXISTS public.record_stripe_refund_or_dispute(text, text, uuid, text, text, text, integer, text, text, jsonb);

COMMIT;

