import { useEffect, useRef, useState } from 'react'

export interface SelectOption {
  value: string
  label: string
  searchText: string
}

interface Props {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function SearchableSelect({ options, value, onChange, placeholder = '搜索商品...' }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)

  const filtered = query.trim()
    ? options.filter((o) => o.searchText.includes(query.trim().toLowerCase()))
    : options

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (val: string) => {
    onChange(val)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="searchable-select" ref={wrapperRef}>
      <input
        type="text"
        value={open ? query : selectedOption?.label ?? query}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!open) setOpen(true)
        }}
      />
      {open && (
        <ul className="searchable-select-dropdown">
          {filtered.length === 0 ? (
            <li className="searchable-select-empty">无匹配商品</li>
          ) : (
            filtered.map((o) => (
              <li
                key={o.value}
                className={o.value === value ? 'active' : ''}
                onMouseDown={() => handleSelect(o.value)}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
