export type Role = "admin" | "sales";

type UserLike = { email?: string | null; app_metadata?: Record<string, any> } | null | undefined;

/** Rol, Supabase Auth'taki app_metadata.role alanından gelir (yalnız sunucu yazabilir).
 *  ALLOWED_EMAILS içindeki adresler yönetici sayılır (ilk kurulum için). */
export function roleOf(user: UserLike): Role | null {
  if (!user) return null;
  const r = user.app_metadata?.role;
  if (r === "admin" || r === "sales") return r;
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (user.email && allowed.includes(user.email.toLowerCase())) return "admin";
  return null;
}
