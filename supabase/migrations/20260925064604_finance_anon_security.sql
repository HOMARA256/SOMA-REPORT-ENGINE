-- Prevent the public/anonymous API role from discovering or querying finance data.
revoke all privileges on table
  public.onboarding_fee_bands,
  public.school_billing_profiles,
  public.learner_census_snapshots,
  public.support_concessions,
  public.subscription_invoice_adjustments,
  public.school_fee_structures,
  public.school_fee_items,
  public.learner_fee_invoices,
  public.school_payment_channels,
  public.school_fee_payments,
  public.finance_approval_rules,
  public.finance_audit_events
from anon;;
