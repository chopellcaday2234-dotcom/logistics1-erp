// src/hooks/useData.js
import { useState, useEffect, useCallback } from 'react'

export const useData = (fetchFn, deps = []) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchFn()
      setData(res.data?.data ?? res.data)
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => { load() }, [load])

  return { data, loading, error, reload: load }
}
