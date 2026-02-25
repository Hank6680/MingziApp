interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="pagination">
      <button
        type="button"
        className="ghost"
        disabled={page <= 0}
        onClick={() => onPageChange(page - 1)}
      >
        上一页
      </button>
      <span>
        {page + 1} / {totalPages}
      </span>
      <button
        type="button"
        className="ghost"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
      </button>
    </div>
  )
}
