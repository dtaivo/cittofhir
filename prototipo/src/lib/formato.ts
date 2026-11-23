export const numero = (n: number) => n.toLocaleString("en-US");
export const porcentaje = (parte: number, total: number) => (total ? (parte / total) * 100 : 0).toFixed(1);
export function tamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export function fechaUtc(iso: string) {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return { dia: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`, hora: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}` };
}
export const cx = (...clases: (string | false | null | undefined)[]) => clases.filter(Boolean).join(" ");
