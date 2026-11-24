/** Telefonu WhatsApp biçimine çevirir: 0532 123 45 67, +90 532 ..., 532... -> 90532... */
export function normalizePhone(input: string) {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = "90" + d.slice(1);
  else if (d.length === 10 && d.startsWith("5")) d = "90" + d;
  return d;
}
