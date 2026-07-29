import { z } from 'zod'

const operationKey = z.string().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/)

export const PaymentCreateSchema = z.object({
  order_id: z.string().uuid(),
  provider: z.enum(['mock','portone_sandbox']),
  idempotency_key: operationKey,
}).strict()

export const PaymentVerifySchema = z.object({
  payment_id: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  callback_state: z.string().min(40).max(1000),
}).strict()

export const PaymentDocumentSchema = z.object({
  payment_transaction_id: z.string().uuid(),
  document_type: z.enum(['cash_receipt','tax_invoice']),
  business_reference: z.string().trim().min(1).max(200).optional(),
}).strict()

export const PaymentAdminOperationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('retry_webhook'), event_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('refund'), payment_id: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/), amount_krw: z.number().int().min(1).max(100000000), reason: z.string().trim().min(2).max(200), idempotency_key: operationKey }).strict(),
])

export type PaymentAdminOperation = z.infer<typeof PaymentAdminOperationSchema>
