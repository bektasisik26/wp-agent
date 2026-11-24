import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { nav } from "@/lib/nav";
import Pwa from "@/components/pwa";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
        <nav className="flex flex-wrap gap-4 text-sm font-medium">
          {nav.filter((n) => !n.adminOnly || me.role === "admin").map((n) => (
            <Link key={n.href} href={n.href} className="text-gray-700 hover:text-black">{n.label}</Link>
          ))}
        </nav>
        <form action={signOut} className="flex items-center gap-3 text-xs text-gray-500">
          <Pwa push />
          <Link href="/hesabim" className="underline">{me.name}</Link>
          <button className="underline">Çıkış</button>
        </form>
      </header>
      {children}
    </div>
  );
}
