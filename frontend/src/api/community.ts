import { api } from './client'

export interface CommunityFilament {
  id: string
  manufacturer: string
  name: string
  material: string
  color_name: string | null
  color_hex: string | null
  diameter: number
  weights: Array<{ weight: number; spool_weight: number | null; spool_type?: string }>
  density: number | null
  print_temp_min: number | null
  print_temp_max: number | null
  bed_temp_min: number | null
  bed_temp_max: number | null
  glow: boolean
  translucent: boolean
  finish: string | null
  pattern: string | null
  fill: string | null
  is_metallic: boolean
  is_carbon: boolean
  is_wood: boolean
  multi_color: boolean
}

export interface CommunityListResponse {
  items: CommunityFilament[]
  total: number
  page: number
  page_size: number
  pages: number
  synced_at: string | null
}

export interface CommunityStats {
  total_profiles:    number
  total_brands:      number
  contributor_count: number
  synced_at:         string | null
}

export interface CommunityImportPayload {
  manufacturer:    string
  name:            string
  material:        string
  color_name?:     string
  color_hex?:      string
  diameter:        number
  density?:        number
  print_temp_min?: number
  print_temp_max?: number
  bed_temp_min?:   number
  bed_temp_max?:   number
  initial_weight:  number
  spool_weight?:   number
  purchase_price?: number
  location_id?:    number
}

export const communityApi = {
  stats: () =>
    api.get<CommunityStats>('/community/stats').then((r) => r.data),

  list: (params?: {
    search?: string
    material?: string
    diameter?: number
    manufacturer?: string
    page?: number
    page_size?: number
  }) => api.get<CommunityListResponse>('/community/filaments', { params }).then((r) => r.data),

  sync: () =>
    api.post<CommunityStats>('/community/sync').then((r) => r.data),

  import: (data: CommunityImportPayload) =>
    api.post('/community/import', data).then((r) => r.data),
}
