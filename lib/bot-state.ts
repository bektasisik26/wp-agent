import "server-only";
import { createAdmin } from "@/lib/supabase/admin";

/** Bot yeniden açılınca, "Bot kapalı" yüzünden insan moduna düşen konuşmaları bota geri verir. */
export async function releaseBotOffConversations() {
  await createAdmin()
    .from("conversations")
    .update({ mode: "bot", handoff_reason: null })
    .eq("mode", "human")
    .eq("handoff_reason", "Bot kapalı");
}
