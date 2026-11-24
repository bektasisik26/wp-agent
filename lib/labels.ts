export const STATUS_LABEL: Record<string, string> = {
  yeni: "Yeni",
  urunler_netlesiyor: "Ürünler netleşiyor",
  teklif_bekliyor: "Teklif bekliyor",
  teklif_gonderildi: "Teklif gönderildi",
  musteri: "Müşteri",
  kaybedildi: "Kaybedildi",
};
export const STATUS_KEYS = Object.keys(STATUS_LABEL);

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
