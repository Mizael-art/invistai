import { z } from "zod";
export const emailField = z.string().trim().toLowerCase().min(1).max(254).email();
export const loginInput = z.object({ email: emailField, password: z.string().min(1).max(200) });
export type LoginInput = z.infer<typeof loginInput>;

import { isValidName, normalizeName, normalizePhone, passwordOk, MAX_PASSWORD } from "@/lib/validation";
export const registerInput = z.object({
  name: z.string().transform(normalizeName).refine(isValidName, "invalid_name"),
  email: emailField,
  phone: z.string().transform((s, ctx) => { const p = normalizePhone(s); if (!p) { ctx.addIssue({ code: "custom", message: "invalid_phone" }); return z.NEVER; } return p; }),
  password: z.string().max(MAX_PASSWORD).refine(passwordOk, "weak_password"),
});
export type RegisterInput = z.infer<typeof registerInput>;
export const resendInput = z.object({ email: emailField.optional() });

export const forgotInput = z.object({ email: emailField });
export const resetInput = z.object({ password: z.string().max(MAX_PASSWORD).refine(passwordOk, "weak_password") });

/** Dados pessoais editáveis. `.strict()`: qualquer campo extra (ex.: e-mail) é rejeitado — informações protegidas não são alteráveis aqui. */
export const profileInput = z.object({
  name: z.string().transform(normalizeName).refine(isValidName, "invalid_name"),
  phone: z.string().transform((s, ctx) => { const p = normalizePhone(s); if (!p) { ctx.addIssue({ code: "custom", message: "invalid_phone" }); return z.NEVER; } return p; }),
}).strict();
