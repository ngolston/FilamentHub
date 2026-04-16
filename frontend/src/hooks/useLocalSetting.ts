import { useState, useCallback } from 'react'

export function useLocalSetting<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      return item !== null ? (JSON.parse(item) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const set = useCallback(
    (newValue: T) => {
      setValue(newValue)
      try {
        localStorage.setItem(key, JSON.stringify(newValue))
      } catch {
        // quota exceeded — ignore
      }
    },
    [key],
  )

  return [value, set]
}
