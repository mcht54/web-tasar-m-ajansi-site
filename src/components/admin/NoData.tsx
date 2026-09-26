/** "0" ile "veri yok" aynı şey değildir: veri kaynağı yoksa bunu açıkça göster. */
export function NoData({ reason }: { reason?: string }) {
  return <span className="text-sm font-normal text-muted" title={reason}>Henüz veri yok</span>;
}
