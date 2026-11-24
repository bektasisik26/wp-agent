import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runFollowups } from "@/lib/followup";
import { checkConnection, checkWaiting } from "@/lib/monitor";
import { logError } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const want = process.env.CRON_SECRET ?? "";
  if (!want) return false;
  const a = Buffer.from(req.headers.get("x-cron-secret") ?? "");
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Her 10 dakikada çağrılır: bağlantı kontrolü, cevap bekleyen uyarısı, otomatik takip
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  const out: Record<string, unknown> = {};
  try { await checkConnection(); out.baglanti = "tamam"; } catch (e) { out.baglanti = "hata"; await logError("bağlantı kontrolü", e); }
  try { out.bekleyenUyari = await checkWaiting(); } catch (e) { out.bekleyenUyari = "hata"; await logError("bekleme kontrolü", e); }
  try { out.takip = await runFollowups(); } catch (e) { out.takip = "hata"; await logError("takip", e); }
  return NextResponse.json(out);
}
