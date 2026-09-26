// Rol → izin matrisi. Yeni ekran eklerken buradaki izinlerden birine bağlayın.

export type Role = "ADMIN" | "EDITOR" | "SEO";
export type Permission =
  | "content" // sayfa/blog içerik alanları
  | "seo" // teknik SEO alanları (robots, canonical, URL, schema), anahtar kelime, analiz, yönlendirme
  | "media"
  | "leads"
  | "settings" // site ayarları ve entegrasyonlar
  | "users"
  | "logs";

export const ROLE_LABELS: Record<Role, string> = { ADMIN: "Yönetici", EDITOR: "Editör", SEO: "SEO Uzmanı" };

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: ["content", "seo", "media", "leads", "settings", "users", "logs"],
  EDITOR: ["content", "media", "leads"],
  SEO: ["content", "seo", "media", "logs"],
};

export function can(role: Role, perm: Permission): boolean {
  return MATRIX[role].includes(perm);
}
