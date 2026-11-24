import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { ALLOWED_EXT, DOC_BUCKET, MAX_DOC_BYTES, MAX_TEXT_CHARS, TEXT_EXT, extOf, formatSize } from "@/lib/docs";

async function uploadDoc(formData: FormData) {
  "use server";
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Dosya seçilmedi.");
  const ext = extOf(file.name);
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) throw new Error("Yalnızca PDF, TXT, MD ve CSV yüklenebilir.");
  if (file.size > MAX_DOC_BYTES) throw new Error("Dosya 10 MB'dan büyük olamaz.");

  const db = createAdmin();
  const path = `${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const up = await db.storage.from(DOC_BUCKET).upload(path, buf, {
    contentType: file.type || "application/octet-stream",
  });
  if (up.error) throw new Error(up.error.message);

  const text = TEXT_EXT.includes(ext) ? buf.toString("utf-8").slice(0, MAX_TEXT_CHARS) : null;
  const ins = await db.from("bot_documents").insert({
    name: file.name,
    storage_path: path,
    mime_type: file.type || null,
    size_bytes: file.size,
    text_content: text,
  });
  if (ins.error) {
    await db.storage.from(DOC_BUCKET).remove([path]);
    throw new Error(ins.error.message);
  }
  revalidatePath("/ayarlar");
}

async function deleteDoc(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id"));
  const db = createAdmin();
  const { data } = await db.from("bot_documents").select("storage_path").eq("id", id).single();
  if (data) await db.storage.from(DOC_BUCKET).remove([data.storage_path]);
  await db.from("bot_documents").delete().eq("id", id);
  revalidatePath("/ayarlar");
}

async function toggleDoc(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  await createAdmin().from("bot_documents").update({ active: !active }).eq("id", id);
  revalidatePath("/ayarlar");
}

export default async function Documents() {
  const { data: docs } = await createAdmin()
    .from("bot_documents")
    .select("id,name,size_bytes,active,created_at")
    .order("created_at", { ascending: false });

  return (
    <section className="card mt-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Dokümanlar</h2>
        <p className="text-sm text-gray-500">
          Botun işletme hakkında bilgi alacağı belgeler (PDF, TXT, MD, CSV; en fazla 10 MB). Pasif yapılan doküman bota gönderilmez.
          Fiyat içeren belge yüklersen bile bot fiyat vermez, ama yine de gerek yoksa yükleme.
        </p>
      </div>

      <form action={uploadDoc} className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".pdf,.txt,.md,.csv" required className="text-sm" />
        <button className="btn">Yükle</button>
      </form>

      {(docs ?? []).length === 0 ? (
        <p className="text-sm text-gray-500">Henüz doküman yok.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {docs!.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <span className={d.active ? "" : "text-gray-400 line-through"}>{d.name}</span>
                <span className="ml-2 text-xs text-gray-500">{formatSize(d.size_bytes)}</span>
              </div>
              <div className="flex gap-3">
                <form action={toggleDoc}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="active" value={String(d.active)} />
                  <button className="underline">{d.active ? "Pasif yap" : "Aktif yap"}</button>
                </form>
                <form action={deleteDoc}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="text-red-600 underline">Sil</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
