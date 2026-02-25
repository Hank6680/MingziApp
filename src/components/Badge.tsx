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

export function WarehouseTypeBadge({ type }: { type: string }) {
  return <Badge className={WAREHOUSE_MAP[type] ?? ''}>{type}</Badge>
}

export function AvailabilityBadge({ available }: { available: boolean }) {
  return available
    ? <Badge className="badge-available">在售</Badge>
    : <Badge className="badge-unavailable">暂停</Badge>
}

export function PickingStatusBadge({ picked, outOfStock, status }: { picked?: boolean; outOfStock?: boolean; status?: string }) {
  if (outOfStock) return <Badge className="badge-out-of-stock">缺货</Badge>
  if (picked || status === 'picked') return <Badge className="badge-picked">已拣</Badge>
  return <Badge className="badge-pending-pick">待拣</Badge>
}
