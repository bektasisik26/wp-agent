import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { releaseBotOffConversations } from "@/lib/bot-state";
import { isOpenNow, type HoursEntry } from "@/lib/hours";

async function toggle(formData: FormData) {
  "use server";
  await requireAdmin();
  const enable = formData.get("enable") === "true";
  const { error } = await createAdmin().from("bot_settings").update({ bot_enabled: enable }).eq("id", 1);
  if (error) throw new Error(error.message);
  if (enable) await releaseBotOffConversations();
  revalidatePath("/");
  revalidatePath("/ayarlar");
}

export default async function BotToggle() {
  const { data: s } = await createAdmin().from("bot_settings").select("bot_enabled,working_hours,timezone").eq("id", 1).single();
  if (!s) return null;
  const open = isOpenNow(s.working_hours as HoursEntry[], s.timezone);
  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 font-medium">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.bot_enabled ? "bg-green-500" : "bg-red-500"}`} />
          Bot {s.bot_enabled ? "açık" : "kapalı"}
        </div>
        <div className="text-xs text-gray-500">
          Şu an mesai {open ? "içi" : "dışı"}. {s.bot_enabled ? "" : "Kapalıyken gelen konuşmalar bekleyen devir olarak görünür."}
        </div>
      </div>
      <form action={toggle}>
        <input type="hidden" name="enable" value={String(!s.bot_enabled)} />
        <button className="btn">{s.bot_enabled ? "Botu kapat" : "Botu aç"}</button>
      </form>
    </div>
  );
}
