export type SeedPage = {
  path: string;
  name: string;
  crumb?: string;
  seoTitle?: string;
  metaDescription: string;
  h1: string;
  intro: string;
  body: string;
  faq?: { q: string; a: string }[];
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  excerpt?: string;
  category?: string;
  robotsIndex?: boolean;
  status?: "DRAFT" | "PUBLISHED";
};
