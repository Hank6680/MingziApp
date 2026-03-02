import type { Product } from '../types'

interface ProductCardProps {
  product: Product
  quantity: string
  onQuantityChange: (id: number, value: string) => void
  onToggleAvailability?: (id: number) => void
  onEdit?: (product: Product) => void
  onDelete?: (id: number) => void
  isAdmin?: boolean
}

export default function ProductCard({
  product,
  quantity,
  onQuantityChange,
  onToggleAvailability,
  onEdit,
  onDelete,
  isAdmin,
}: ProductCardProps) {
  const warehouseColors = {
    干: 'bg-amber-100 text-amber-800',
    鲜: 'bg-green-100 text-green-800',
    冻: 'bg-blue-100 text-blue-800',
  }

  return (
    <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-4 border border-gray-200">
      {/* Product Image Placeholder */}
      <div className="w-full h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg mb-3 flex items-center justify-center">
        <span className="text-4xl opacity-30">📦</span>
      </div>

      {/* Product Info */}
      <div className="mb-3">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-gray-900 text-base leading-tight flex-1">{product.name}</h3>
          {product.warehouseType && (
            <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${warehouseColors[product.warehouseType as keyof typeof warehouseColors] || 'bg-gray-100 text-gray-800'}`}>
              {product.warehouseType}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
          <span>单位: {product.unit || '-'}</span>
          <span className="font-semibold text-gray-900">¥{product.price?.toFixed(2) || '0.00'}</span>
        </div>

        {isAdmin && (
          <div className="text-xs text-gray-500">
            库存: {product.stock ?? 0}
          </div>
        )}
      </div>

      {/* Availability Badge */}
      <div className="mb-3">
        {product.isAvailable ? (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            ✓ 可用
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            ✕ 不可用
          </span>
        )}
      </div>

      {/* Quantity Input */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">下单数量</label>
        <input
          type="number"
          min="0"
          step="1"
          value={quantity}
          onChange={(e) => onQuantityChange(product.id, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          placeholder="0"
        />
      </div>

      {/* Admin Actions */}
      {isAdmin && (
        <div className="flex gap-2">
          {onToggleAvailability && (
            <button
              onClick={() => onToggleAvailability(product.id)}
              className="flex-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              {product.isAvailable ? '禁用' : '启用'}
            </button>
          )}
          {onEdit && (
            <button
              onClick={() => onEdit(product)}
              className="flex-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
            >
              编辑
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(product.id)}
              className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
            >
              删除
            </button>
          )}
        </div>
      )}
    </div>
  )
}
