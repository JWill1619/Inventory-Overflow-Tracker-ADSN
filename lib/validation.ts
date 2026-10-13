import { z } from "zod";
export const normalize = (s: string) =>
  s.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
const name = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .transform((s) => s.replace(/\s+/g, " "));
const qty = z.number().int().min(1).max(1_000_000);
const line = z.object({
  productId: z.uuid().optional(),
  name,
  brand: z.string().trim().max(80).default(""),
  quantity: qty,
});
const lines = z
  .array(line)
  .min(1)
  .max(100)
  .refine(
    (v) =>
      new Set(
        v.map(
          (x) => x.productId ?? normalize(x.name) + "|" + normalize(x.brand),
        ),
      ).size === v.length,
    "Duplicate products: combine quantities into one line.",
  );
const base = { key: z.uuid() };
export const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    ...base,
    action: z.literal("link"),
    palletId: z.uuid(),
    productId: z.uuid(),
    officialProductId: z.uuid(),
    version: z.number().int(),
  }),
  z.object({
    ...base,
    action: z.literal("create"),
    identifier: name,
    lines,
    draft: z.boolean(),
  }),
  z.object({
    ...base,
    action: z.literal("draft"),
    palletId: z.uuid(),
    identifier: name,
    lines,
    version: z.number().int(),
  }),
  z.object({
    ...base,
    action: z.literal("activate"),
    palletId: z.uuid(),
    version: z.number().int(),
  }),
  z.object({
    ...base,
    action: z.literal("rename"),
    palletId: z.uuid(),
    identifier: name,
    version: z.number().int(),
  }),
  z.object({
    ...base,
    action: z.literal("take"),
    palletId: z.uuid(),
    productId: z.uuid(),
    quantity: qty,
    version: z.number().int(),
  }),
  z.object({
    ...base,
    action: z.literal("add"),
    productId: z.uuid().optional(),
    palletId: z.uuid(),
    name,
    brand: z.string().trim().max(80).default(""),
    quantity: qty,
    version: z.number().int(),
  }),
  z.object({
    ...base,
    action: z.literal("correct"),
    palletId: z.uuid(),
    productId: z.uuid(),
    quantity: z.number().int().min(0).max(1_000_000),
    reason: z.string().trim().min(3).max(300),
    version: z.number().int(),
  }),
  z
    .object({
      ...base,
      action: z.literal("transfer"),
      palletId: z.uuid(),
      destinationId: z.uuid(),
      version: z.number().int(),
      lines: z
        .array(z.object({ productId: z.uuid(), quantity: qty }))
        .min(1)
        .max(100)
        .refine(
          (v) => new Set(v.map((l) => l.productId)).size === v.length,
          "Duplicate transfer lines",
        ),
    })
    .refine(
      (v) => v.palletId !== v.destinationId,
      "Choose a different destination",
    ),
]);
export type Mutation = z.infer<typeof mutationSchema>;
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
