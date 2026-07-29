# First advertiser runbook

1. Verify adult status, account ownership, business/rights claims, landing URL, creative safety, slot availability, and feature flags.
2. Keep creative text and applicant identity out of aggregate views. Use the permissioned review route only when necessary and record reason plus audit.
3. Use enquiry → verification → review → quote → manual payment review → schedule → active → completed/refund.
4. Production uses `manual` or `disabled` payment only. Do not enable PortOne live secrets or webhooks.
5. Do not create a real order or payment as a test. Use synthetic/isolated lifecycle tests.
6. Pause on impersonation, minor risk, privacy exposure, payment mismatch, unsafe creative, complaint, or health/RLS failure.
