interface BadgeProps {
  className?: string
  children: React.ReactNode
}

export function Badge({ className = '', children }: BadgeProps) {
  return <span className={`badge ${className}`}>{children}</span>
}

const ORDER_STATUS_MAP: Record<string, { cls: string; label: string }> = {
  created:   { cls: 'badge-created',   label: '待确认' },
  confirmed: { cls: 'badge-confirmed', label: '已确认' },
  shipped:   { cls: 'badge-shipped',   label: '配送中' },
  completed: { cls: 'badge-completed', label: '已完成' },
  cancelled: { cls: 'badge-cancelled', label: '已取消' },
}

export function OrderStatusBadge({ status }: { status: string }) {
  const info = ORDER_STATUS_MAP[status] ?? { cls: '', label: status }
  return <Badge className={info.cls}>{info.label}</Badge>
}

const WAREHOUSE_MAP: Record<string, string> = {
  '干': 'badge-wh-dry',
  '鲜': 'badge-wh-fresh',
  '冻': 'badge-wh-frozen',
}

export function WarehouseTypeBadge({ type }: { type?: string }) {
  if (!type) return <Badge>{'-'}</Badge>
  return <Badge className={WAREHOUSE_MAP[type] ?? ''}>{type}</Badge>
}

export function AvailabilityBadge({ available }: { available: boolean | number }) {
  return available
    ? <Badge className="badge-available">在售</Badge>
    : <Badge className="badge-unavailable">暂停</Badge>
}

export function PickingStatusBadge({ picked, outOfStock, status }: { picked?: number | boolean; outOfStock?: number | boolean; status?: string }) {
  if (outOfStock) return <Badge className="badge-out-of-stock">缺货</Badge>
  if (picked || status === 'picked') return <Badge className="badge-picked">已拣</Badge>
  return <Badge className="badge-pending-pick">待拣</Badge>
}

const RECONCILE_STATUS_MAP: Record<string, { cls: string; label: string }> = {
  pending:     { cls: 'badge-reconcile-pending',    label: '待对账' },
  reconciled:  { cls: 'badge-reconcile-done',       label: '已对账' },
  discrepancy: { cls: 'badge-reconcile-discrepancy', label: '有差异' },
}

export function ReconcileStatusBadge({ status }: { status: string }) {
  const info = RECONCILE_STATUS_MAP[status] ?? { cls: '', label: status }
  return <Badge className={info.cls}>{info.label}</Badge>
}

const MATCH_STATUS_MAP: Record<string, { cls: string; label: string }> = {
  auto_confirmed:   { cls: 'badge-match-auto',    label: '自动匹配' },
  manual_confirmed: { cls: 'badge-match-manual',  label: '手动确认' },
  need_review:      { cls: 'badge-match-review',  label: '待复核' },
  unmatched:        { cls: 'badge-match-unmatched', label: '未匹配' },
  ignored:          { cls: 'badge-match-ignored',  label: '已忽略' },
}

export function MatchStatusBadge({ status }: { status: string }) {
  const info = MATCH_STATUS_MAP[status] ?? { cls: '', label: status }
  return <Badge className={info.cls}>{info.label}</Badge>
}
