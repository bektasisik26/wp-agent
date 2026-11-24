import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleOf, type Role } from "@/lib/roles";

export type Staff = { id: string; email: string; name: string; role: Role };

export async function getStaff(): Promise<Staff | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  const role = roleOf(u);
  if (!u || !role) return null;
  const email = u.email ?? "";
  return { id: u.id, email, name: (u.user_metadata?.name as string) || email.split("@")[0], role };
}

export async function requireStaff(): Promise<Staff> {
  const s = await getStaff();
  if (!s) redirect("/login");
  return s;
}

export async function requireAdmin(): Promise<Staff> {
  const s = await requireStaff();
  if (s.role !== "admin") redirect("/");
  return s;
}

/** Satışçı yalnızca kendisine atanmış ya da kimseye atanmamış kayıtları görür. */
export function canAccess(me: Staff, assignedTo: string | null) {
  return me.role === "admin" || assignedTo === null || assignedTo === me.id;
}
export function allowedTarget(me: Staff, target: string) {
  return me.role === "admin" || target === "" || target === me.id;
}
