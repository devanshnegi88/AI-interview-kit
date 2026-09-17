import { z } from "zod";

/** bcrypt only uses the first 72 bytes; reject longer so the hash matches what the user typed. */
export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email")
  .max(254);

export const CredentialsSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
  })
  .strict();
