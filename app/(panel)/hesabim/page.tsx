import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendTestPush } from "../actions";

async function changePassword(formData: FormData) {
  "use server";
  await requireStaff();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) throw new Error("Şifre en az 8 karakter olmalı.");
  const { error } = await (await createClient()).auth.updateUser({ password });
  if (error) throw new Error(error.message);
  revalidatePath("/hesabim");
}

export default async function Account() {
  const me = await requireStaff();
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Hesabım</h1>
      <section className="card space-y-3 text-sm">
        <div>{me.name} · {me.email} · {me.role === "admin" ? "Yönetici" : "Satışçı"}</div>
        <form action={changePassword} className="flex flex-wrap items-center gap-2">
          <input name="password" type="password" className="input !w-64" placeholder="Yeni şifre (en az 8 karakter)" minLength={8} required />
          <button className="btn">Şifreyi değiştir</button>
        </form>
        <form action={sendTestPush}>
          <button className="underline">Test bildirimi gönder</button>
          <span className="ml-2 text-xs text-gray-500">Önce üst çubuktan "Bildirimleri aç"a bas.</span>
        </form>
      </section>
    </main>
  );
}
