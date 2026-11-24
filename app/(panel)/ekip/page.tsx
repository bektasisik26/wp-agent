import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { listStaff } from "@/lib/staff";
import { fmtDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function createStaff(formData: FormData) {
  "use server";
  await requireAdmin();
  const email = str(formData, "email").toLowerCase();
  const name = str(formData, "name");
  const password = String(formData.get("password") ?? "");
  const role = formData.get("role") === "admin" ? "admin" : "sales";
  if (password.length < 8) throw new Error("Şifre en az 8 karakter olmalı.");
  const { error } = await createAdmin().auth.admin.createUser({
    email, password, email_confirm: true,
    app_metadata: { role }, user_metadata: { name },
  });
  if (error) throw new Error(error.message);
  revalidatePath("/ekip");
}

async function setBanned(formData: FormData) {
  "use server";
  const me = await requireAdmin();
  const id = str(formData, "id");
  if (id === me.id) throw new Error("Kendini pasif yapamazsın.");
  const ban = formData.get("ban") === "true";
  const { error } = await createAdmin().auth.admin.updateUserById(id, { ban_duration: ban ? "876000h" : "none" });
  if (error) throw new Error(error.message);
  revalidatePath("/ekip");
}

async function setRole(formData: FormData) {
  "use server";
  const me = await requireAdmin();
  const id = str(formData, "id");
  if (id === me.id) throw new Error("Kendi rolünü değiştiremezsin.");
  const role = formData.get("role") === "admin" ? "admin" : "sales";
  const { error } = await createAdmin().auth.admin.updateUserById(id, { app_metadata: { role } });
  if (error) throw new Error(error.message);
  revalidatePath("/ekip");
}

async function resetPassword(formData: FormData) {
  "use server";
  await requireAdmin();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) throw new Error("Şifre en az 8 karakter olmalı.");
  const { error } = await createAdmin().auth.admin.updateUserById(str(formData, "id"), { password });
  if (error) throw new Error(error.message);
  revalidatePath("/ekip");
}

async function removeStaff(formData: FormData) {
  "use server";
  const me = await requireAdmin();
  const id = str(formData, "id");
  if (id === me.id) throw new Error("Kendini silemezsin.");
  const { error } = await createAdmin().auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
  revalidatePath("/ekip");
}

export default async function Team() {
  const me = await requireAdmin();
  const staff = await listStaff();

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Ekip</h1>

      <section className="card space-y-3">
        <h2 className="font-semibold">Yeni kullanıcı</h2>
        <form action={createStaff} className="grid gap-3 md:grid-cols-2">
          <input name="name" className="input" placeholder="Ad Soyad" required />
          <input name="email" type="email" className="input" placeholder="E-posta" required />
          <input name="password" type="text" className="input" placeholder="Başlangıç şifresi (en az 8 karakter)" required minLength={8} />
          <select name="role" className="input" defaultValue="sales">
            <option value="sales">Satışçı</option>
            <option value="admin">Yönetici</option>
          </select>
          <button className="btn md:col-span-2">Kullanıcı oluştur</button>
        </form>
        <p className="text-xs text-gray-500">
          Satışçı yalnızca kendisine atanmış ve kimseye atanmamış konuşma ve lead'leri görür. Yönetici her şeyi görür, ayarları ve ekibi yönetir.
          Şifreyi kullanıcıya iletirken güvenli bir yol seç, kullanıcı kendi şifresini "Hesabım" sayfasından değiştirebilir.
        </p>
      </section>

      <section className="card">
        <ul className="divide-y divide-gray-200">
          {staff.map((s) => (
            <li key={s.id} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className={`font-medium ${s.banned ? "text-gray-400 line-through" : ""}`}>{s.name}</span>
                  <span className="ml-2 text-xs text-gray-500">{s.email}</span>
                  <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs">{s.role === "admin" ? "Yönetici" : "Satışçı"}</span>
                  {s.banned && <span className="ml-2 text-xs text-red-600">pasif</span>}
                  {s.id === me.id && <span className="ml-2 text-xs text-gray-500">(sen)</span>}
                </div>
                <div className="text-xs text-gray-500">Son giriş: {fmtDate(s.lastSignIn) || "-"}</div>
              </div>
              {s.id !== me.id && (
                <div className="flex flex-wrap items-center gap-3">
                  <form action={setRole} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="role" value={s.role === "admin" ? "sales" : "admin"} />
                    <button className="underline">{s.role === "admin" ? "Satışçı yap" : "Yönetici yap"}</button>
                  </form>
                  <form action={setBanned}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="ban" value={String(!s.banned)} />
                    <button className="underline">{s.banned ? "Aktif yap" : "Pasif yap"}</button>
                  </form>
                  <form action={resetPassword} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input name="password" className="input !w-44" placeholder="Yeni şifre" minLength={8} required />
                    <button className="underline">Şifre sıfırla</button>
                  </form>
                  <form action={removeStaff}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-red-600 underline">Sil</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
