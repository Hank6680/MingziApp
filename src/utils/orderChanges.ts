import type { OrderChangeLog } from '../types'

const formatItemLabel = (detail: Record<string, unknown>) => {
  const name = typeof detail.productName === 'string' ? detail.productName : null
  const productId = detail.productId != null ? `#${detail.productId}` : ''
  const unit = typeof detail.unit === 'string' ? detail.unit : ''
  const qty = detail.qtyOrdered != null ? `${detail.qtyOrdered}${unit}` : ''
  if (name) {
    return `${name}${qty ? ` · ${qty}` : ''}`
  }
  return `${productId}${qty ? ` · ${qty}` : ''}`.trim()
}

export const describeOrderChange = (change: OrderChangeLog): string => {
  const detail = change.detail && typeof change.detail === 'object' ? change.detail : null

  switch (change.type) {
    case 'order_created': {
      const items = Array.isArray(detail?.items) ? detail?.items : []
      if (items.length) {
        return `新订单创建，含 ${items.length} 种商品：${items
          .map((item) => formatItemLabel(item as Record<string, unknown>))
          .join('；')}`
      }
      return '新订单创建'
    }
    case 'merged_order_update': {
      const merged = detail && (detail as Record<string, unknown>).merged ? '（合单）' : ''
      const items = Array.isArray(detail?.items) ? detail?.items : []
      if (items.length) {
        return `客户加单${merged}：${items
          .map((item) => formatItemLabel(item as Record<string, unknown>))
          .join('；')}`
      }
      return `客户加单${merged}`
    }
    case 'item_added': {
      if (detail?.item && typeof detail.item === 'object') {
        return `新增 ${formatItemLabel(detail.item as Record<string, unknown>)}${detail.redirectedOrderId ? `（重定向至订单 #${detail.redirectedOrderId}）` : ''}`
      }
      return '新增商品'
    }
    case 'item_removed': {
      return `移除 ${formatItemLabel(detail ?? {})}`
    }
    case 'item_updated': {
      const before = detail?.before as Record<string, unknown>
      const after = detail?.after as Record<string, unknown>
      const fields: string[] = []
      if (before?.qtyOrdered != null && after?.qtyOrdered != null && before.qtyOrdered !== after.qtyOrdered) {
        fields.push(`数量 ${before.qtyOrdered} → ${after.qtyOrdered}`)
      }
      if (before?.unitPrice != null && after?.unitPrice != null && before.unitPrice !== after.unitPrice) {
        fields.push(`单价 ${before.unitPrice} → ${after.unitPrice}`)
      }
      const itemLabel = formatItemLabel(detail ?? {})
      return `${itemLabel} 调整${fields.length ? `：${fields.join('，')}` : ''}`
    }
    default: {
      if (detail) {
        try {
          return `${change.type}: ${JSON.stringify(detail)}`
        } catch (err) {
          return change.type
        }
      }
      return change.type
    }
  }
}
