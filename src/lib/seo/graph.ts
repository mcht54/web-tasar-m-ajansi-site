// Site grafiği: her sayfanın şablon tarafından üretilen iç linkleri.
//
// Aynı fonksiyon hem sayfayı render ederken ("İlgili sayfalar", "İlçeler" vb.
// bölümleri) hem de iç link analizinde kullanılır. Böylece analizin gördüğü link
// yapısı ile Google'ın gördüğü HTML birebir aynıdır.

export type PageNode = {
  id: string;
  path: string;
  type:
    | "HOME" | "SERVICE" | "SERVICE_LOCATION" | "CITY" | "DISTRICT"
    | "SECTOR" | "SECTOR_LOCATION" | "BLOG_POST" | "BLOG_INDEX" | "STATIC";
  published: boolean;
  name: string;
  anchor: string; // şablon linklerinde kullanılacak doğal bağlantı metni
  crumb: string; // breadcrumb etiketi
  serviceId: string | null;
  serviceSlug: string | null;
  provinceId: number | null;
  districtId: number | null;
  sectorId: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  category: string | null;
  publishedAt: Date | null;
  sortOrder: number;
};

export type LinkGroup = {
  key: string;
  title: string;
  links: { path: string; label: string }[];
};

/** Ana hizmet: il/ilçe/sektör hiyerarşisi bu hizmetin altında durur. */
export const ROOT_SERVICE_SLUG = "web-tasarim";

export class SiteGraph {
  readonly nodes: PageNode[];
  private byPath = new Map<string, PageNode>();

  constructor(nodes: PageNode[]) {
    this.nodes = nodes;
    for (const n of nodes) this.byPath.set(n.path, n);
  }

  get(path: string): PageNode | undefined {
    return this.byPath.get(path);
  }

  private pub(filter: (n: PageNode) => boolean): PageNode[] {
    return this.nodes.filter((n) => n.published && filter(n));
  }

  /** Şablonun sayfa içinde gösterdiği bağlamsal link grupları. */
  templateLinks(page: PageNode): LinkGroup[] {
    const groups: LinkGroup[] = [];
    const add = (key: string, title: string, list: PageNode[], limit = 50) => {
      const links = list
        .filter((n) => n.path !== page.path)
        .slice(0, limit)
        .map((n) => ({ path: n.path, label: n.anchor }));
      if (links.length) groups.push({ key, title, links });
    };
    const byOrder = (a: PageNode, b: PageNode) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "tr");
    const byName = (a: PageNode, b: PageNode) => a.name.localeCompare(b.name, "tr");
    const recent = (a: PageNode, b: PageNode) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
    const rootService = this.pub((n) => n.type === "SERVICE" && n.serviceSlug === ROOT_SERVICE_SLUG);
    const cityOf = (provinceId: number | null) =>
      this.pub((n) => n.type === "CITY" && n.provinceId === provinceId);

    switch (page.type) {
      case "HOME":
        add("services", "Hizmetlerimiz", this.pub((n) => n.type === "SERVICE").sort(byOrder));
        add("sectors", "Sektörler", this.pub((n) => n.type === "SECTOR").sort(byOrder));
        add("cities", "Hizmet verdiğimiz şehirler", this.pub((n) => n.type === "CITY").sort(byName));
        add("blog", "Rehberden", this.pub((n) => n.type === "BLOG_POST").sort(recent), 3);
        break;

      case "SERVICE": {
        if (page.serviceSlug === ROOT_SERVICE_SLUG) {
          add("cities", "Şehirlere göre web tasarım", this.pub((n) => n.type === "CITY").sort(byName));
        } else {
          add(
            "service-cities",
            `Şehirlere göre ${page.name.toLocaleLowerCase("tr-TR")}`,
            this.pub((n) => n.type === "SERVICE_LOCATION" && n.serviceId === page.serviceId).sort(byName),
          );
        }
        add("related-services", "Diğer hizmetler", this.pub((n) => n.type === "SERVICE").sort(byOrder), 8);
        add("sectors", "Sektöre özel çözümler", this.pub((n) => n.type === "SECTOR").sort(byOrder), 10);
        break;
      }

      case "CITY": {
        add("parent", "Ana hizmet", rootService);
        add(
          "districts",
          `${page.name} ilçeleri`,
          this.pub((n) => n.type === "DISTRICT" && n.provinceId === page.provinceId).sort(byName),
        );
        add(
          "city-services",
          `${page.name} için diğer hizmetler`,
          this.pub((n) => n.type === "SERVICE_LOCATION" && n.provinceId === page.provinceId).sort(byOrder),
        );
        add(
          "city-sectors",
          `${page.name} sektör sayfaları`,
          this.pub((n) => n.type === "SECTOR_LOCATION" && n.provinceId === page.provinceId).sort(byName),
        );
        add("nearby", "Yakın şehirler", this.nearest(page, (n) => n.type === "CITY" && n.provinceId !== page.provinceId), 6);
        break;
      }

      case "DISTRICT":
        add("parent", "Bağlı olduğu il", cityOf(page.provinceId));
        add(
          "siblings",
          "Yakın ilçeler",
          this.nearest(page, (n) => n.type === "DISTRICT" && n.provinceId === page.provinceId && n.districtId !== page.districtId),
          8,
        );
        add("root", "Ana hizmet", rootService);
        break;

      case "SERVICE_LOCATION":
        add("parent", "Hizmet", this.pub((n) => n.type === "SERVICE" && n.serviceId === page.serviceId));
        add("city", "Şehir sayfası", cityOf(page.provinceId));
        add(
          "siblings",
          "Aynı şehirde diğer hizmetler",
          this.pub((n) => n.type === "SERVICE_LOCATION" && n.provinceId === page.provinceId).sort(byOrder),
        );
        break;

      case "SECTOR":
        add(
          "sector-cities",
          "Şehirlere göre",
          this.pub((n) => n.type === "SECTOR_LOCATION" && n.sectorId === page.sectorId).sort(byName),
        );
        add("services", "İlgili hizmetler", this.pub((n) => n.type === "SERVICE").sort(byOrder), 6);
        add("other-sectors", "Diğer sektörler", this.pub((n) => n.type === "SECTOR").sort(byOrder), 10);
        break;

      case "SECTOR_LOCATION":
        add("sector", "Sektör sayfası", this.pub((n) => n.type === "SECTOR" && n.sectorId === page.sectorId));
        add("city", "Şehir sayfası", cityOf(page.provinceId));
        add(
          "siblings",
          "Aynı şehirde diğer sektörler",
          this.pub((n) => n.type === "SECTOR_LOCATION" && n.provinceId === page.provinceId).sort(byName),
        );
        break;

      case "BLOG_POST": {
        const posts = this.pub((n) => n.type === "BLOG_POST").sort(recent);
        const same = posts.filter((n) => n.category && n.category === page.category);
        const rest = posts.filter((n) => !same.includes(n));
        add("related", "İlgili yazılar", [...same, ...rest], 3);
        break;
      }

      case "BLOG_INDEX":
        add("posts", "Tüm yazılar", this.pub((n) => n.type === "BLOG_POST").sort(recent), 200);
        break;

      case "STATIC":
        if (page.path === "/iletisim" || page.path === "/teklif-al")
          add("services", "Hizmetlerimiz", this.pub((n) => n.type === "SERVICE").sort(byOrder), 9);
        break;
    }
    return groups;
  }

  /** Coğrafi olarak en yakın yayımlanmış sayfalar (koordinat yoksa ada göre). */
  private nearest(page: PageNode, filter: (n: PageNode) => boolean): PageNode[] {
    const list = this.pub(filter);
    if (page.lat == null || page.lng == null) return list.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    const d = (n: PageNode) =>
      n.lat == null || n.lng == null ? Infinity : (n.lat - page.lat!) ** 2 + ((n.lng - page.lng!) * 0.8) ** 2;
    return list.sort((a, b) => d(a) - d(b));
  }
}

export type Edge = { from: string; to: string; anchor: string; kind: "nav" | "template" | "body" };

export type NavLinks = {
  header: { path: string; label: string }[];
  footerServices: { path: string; label: string }[];
  footerSectors: { path: string; label: string }[];
  footerCompany: { path: string; label: string }[];
};

/** Tüm sayfalarda görünen menü/footer linkleri (analizde "menü linki" sayılır). */
export function siteNav(graph: SiteGraph, navServiceIds: Set<string>): NavLinks {
  const pub = graph.nodes.filter((n) => n.published);
  const services = pub
    .filter((n) => n.type === "SERVICE")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const pick = (path: string, label: string) => (graph.get(path)?.published ? [{ path, label }] : []);
  return {
    header: [
      ...services.filter((n) => n.serviceId && navServiceIds.has(n.serviceId)).map((n) => ({ path: n.path, label: n.crumb })),
      ...pick("/blog", "Rehber"),
      ...pick("/iletisim", "İletişim"),
    ],
    footerServices: services.map((n) => ({ path: n.path, label: n.crumb })),
    footerSectors: pub
      .filter((n) => n.type === "SECTOR")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, 10)
      .map((n) => ({ path: n.path, label: n.crumb })),
    footerCompany: [
      ...pick("/hakkimizda", "Hakkımızda"),
      ...pick("/teklif-al", "Teklif Al"),
      ...pick("/iletisim", "İletişim"),
      ...pick("/blog", "Rehber"),
      ...pick("/kvkk-aydinlatma-metni", "KVKK Aydınlatma Metni"),
    ],
  };
}

export function navPaths(nav: NavLinks): string[] {
  return [
    ...new Set(
      [...nav.header, ...nav.footerServices, ...nav.footerSectors, ...nav.footerCompany, { path: "/", label: "" }].map(
        (l) => l.path,
      ),
    ),
  ];
}
