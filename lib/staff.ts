import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { roleOf, type Role } from "@/lib/roles";

export type StaffRow = { id: string; email: string; name: string; role: Role; banned: boolean; lastSignIn: string | null };

export async function listStaff(): Promise<StaffRow[]> {
  const { data } = await createAdmin().auth.admin.listUsers({ page: 1, perPage: 200 });
  const rows: StaffRow[] = [];
  for (const u of data?.users ?? []) {
    const role = roleOf(u);
    if (!role) continue;
    const bannedUntil = (u as any).banned_until as string | undefined;
    rows.push({
      id: u.id,
      email: u.email ?? "",
      name: (u.user_metadata?.name as string) || (u.email ?? "").split("@")[0],
      role,
      banned: !!bannedUntil && new Date(bannedUntil) > new Date(),
      lastSignIn: u.last_sign_in_at ?? null,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "tr"));
}
