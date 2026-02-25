import { useEffect, useRef, useState } from 'react'

interface Props {
  /** All product names for dropdown matching */
  names: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function SearchableFilter({ names, value, onChange, placeholder = '搜索商品名...' }: Props) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const filtered = value.trim()
    ? names.filter((n) => n.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 20)
    : []

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (name: string) => {
    onChange(name)
    setOpen(false)
  }

  return (
    <div className="searchable-select" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onFocus={() => { if (value.trim()) setOpen(true) }}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(e.target.value.trim().length > 0)
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="searchable-select-dropdown">
          {filtered.map((name) => (
            <li key={name} onMouseDown={() => handleSelect(name)}>
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
