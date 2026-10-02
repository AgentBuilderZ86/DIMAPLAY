/** Normalises a Moroccan mobile number to E.164 (+212 6/7 XX XX XX XX). Returns null if invalid. */
export function normalizeMoroccanPhone(input: string): string | null {
  let digits = input.replace(/[\s().-]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('212')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[67]\d{8}$/.test(digits)) return null;
  return `+212${digits}`;
}
