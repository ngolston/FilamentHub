import axios from 'axios'
import type { SpoolResponse } from '@/types/api'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

const publicClient = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

export interface PublicLocationResponse {
  id: number
  name: string
  description: string | null
  is_dry_box: boolean
  spools: SpoolResponse[]
}

export const publicApi = {
  getSpool: (id: number) =>
    publicClient.get<SpoolResponse>(`/public/spools/${id}`).then((r) => r.data),

  getLocation: (id: number) =>
    publicClient.get<PublicLocationResponse>(`/public/locations/${id}`).then((r) => r.data),
}
