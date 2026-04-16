// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'editor' | 'viewer'
export type SpoolStatus = 'active' | 'empty' | 'archived' | 'drying'
export type PrinterStatus = 'idle' | 'printing' | 'paused' | 'error' | 'offline'
export type PrinterConnectionType = 'octoprint' | 'moonraker' | 'bambu' | 'manual'
export type PrintJobOutcome = 'success' | 'failed' | 'cancelled'
export type AlertSeverity = 'info' | 'warning' | 'critical'

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface PaginationParams {
  page?: number
  page_size?: number
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface UserRegister {
  email: string
  password: string
  display_name: string
  maker_name?: string
}

export interface UserLogin {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface TotpSetupResponse {
  secret: string
  uri: string
}

export interface UserPreferences {
  preferred_weight_unit: string
  preferred_temp_unit: string
  preferred_currency: string
  timezone: string
}

export interface UserResponse {
  id: string
  email: string
  display_name: string
  maker_name: string | null
  avatar_url: string | null
  role: UserRole
  is_active: boolean
  totp_enabled: boolean
  preferred_weight_unit: string
  preferred_temp_unit: string
  preferred_currency: string
  timezone: string
  created_at: string
  updated_at: string
  last_login_at: string | null
}

export interface UserUpdate {
  display_name?: string
  maker_name?: string
  avatar_url?: string
  preferred_weight_unit?: string
  preferred_temp_unit?: string
  preferred_currency?: string
  timezone?: string
}

export interface ApiKeyInfo {
  id: string
  name: string
  key_prefix: string
  scopes: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
}

export interface ApiKeySecret extends ApiKeyInfo {
  key: string  // shown once on creation
}

// ─── Brands ───────────────────────────────────────────────────────────────────

export interface BrandResponse {
  id: number
  name: string
  website: string | null
  country_of_origin: string | null
  logo_url: string | null
  notes: string | null
  created_at: string
}

export interface BrandCreate {
  name: string
  website?: string
  country_of_origin?: string
  notes?: string
}

export type BrandUpdate = Partial<BrandCreate>

// ─── Filament Profiles ────────────────────────────────────────────────────────

export interface FilamentProfileResponse {
  id: number
  brand: BrandResponse | null
  name: string
  material: string
  color_name: string | null
  color_hex: string | null
  diameter: number
  density: number | null
  print_temp_min: number | null
  print_temp_max: number | null
  bed_temp_min: number | null
  bed_temp_max: number | null
  max_print_speed: number | null
  drying_temp: number | null
  drying_duration: number | null
  is_community: boolean
  is_verified: boolean
  product_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FilamentProfileCreate {
  brand_id?: number
  name: string
  material: string
  color_name?: string
  color_hex?: string
  diameter?: number
  density?: number
  print_temp_min?: number
  print_temp_max?: number
  bed_temp_min?: number
  bed_temp_max?: number
  max_print_speed?: number
  drying_temp?: number
  drying_duration?: number
  product_url?: string
  notes?: string
}

export type FilamentProfileUpdate = Partial<FilamentProfileCreate>

export interface FilamentFilters extends PaginationParams {
  brand_id?: number
  material?: string
  diameter?: number
  community?: boolean
  search?: string
}

// ─── Storage Locations ────────────────────────────────────────────────────────

export interface LocationResponse {
  id: number
  name: string
  description: string | null
  is_dry_box: boolean
}

export interface LocationCreate {
  name: string
  description?: string
  is_dry_box?: boolean
}

// ─── Spools ───────────────────────────────────────────────────────────────────

export interface SpoolResponse {
  id: number
  filament: FilamentProfileResponse | null
  brand: BrandResponse | null
  location: LocationResponse | null
  name: string | null
  lot_nr: string | null
  photo_url: string | null
  initial_weight: number
  spool_weight: number
  used_weight: number
  remaining_weight: number
  fill_percentage: number
  purchase_date: string | null
  purchase_price: number | null
  supplier: string | null
  product_url: string | null
  status: SpoolStatus
  notes: string | null
  registered: string
  first_used: string | null
  last_used: string | null
  updated_at: string
}

export interface SpoolCreate {
  filament_id?: number
  brand_id?: number
  location_id?: number
  name?: string
  lot_nr?: string
  initial_weight: number
  spool_weight?: number
  used_weight?: number
  purchase_date?: string
  purchase_price?: number
  supplier?: string
  product_url?: string
  status?: SpoolStatus
  notes?: string
}

export type SpoolUpdate = Partial<SpoolCreate>

export interface SpoolFilters extends PaginationParams {
  status?: SpoolStatus
  material?: string
  brand_id?: number
  location_id?: number
  search?: string
}

// ─── Weight Logs ──────────────────────────────────────────────────────────────

export interface WeightLogResponse {
  id: number
  spool_id: number
  measured_weight: number
  net_weight: number
  notes: string | null
  logged_at: string
}

export interface WeightLogCreate {
  measured_weight: number
  spool_weight_tare?: number
  notes?: string
}

// ─── Printers ─────────────────────────────────────────────────────────────────

export interface PrinterResponse {
  id: number
  name: string
  model: string | null
  connection_type: PrinterConnectionType
  status: PrinterStatus
  notes: string | null
  created_at: string
  last_seen_at: string | null
}

export interface PrinterCreate {
  name: string
  model?: string
  connection_type?: PrinterConnectionType
  api_url?: string
  api_key?: string
  notes?: string
}

export type PrinterUpdate = Partial<PrinterCreate>

export interface AmsSlot {
  slot_index: number
  spool_id: number | null
}

export interface AmsUnit {
  id: number
  unit_index: number
  name: string
  slots: AmsSlot[]
}

// ─── Print Jobs ───────────────────────────────────────────────────────────────

export interface PrintJobResponse {
  id: number
  printer: PrinterResponse | null
  spool_id: number | null
  file_name: string
  filament_used_g: number
  duration_seconds: number | null
  outcome: PrintJobOutcome
  notes: string | null
  started_at: string | null
  finished_at: string | null
}

export interface PrintJobCreate {
  printer_id?: number
  spool_id?: number
  file_name: string
  filament_used_g: number
  duration_seconds?: number
  outcome?: PrintJobOutcome
  notes?: string
  started_at?: string
  finished_at?: string
}

export interface PrintJobFilters extends PaginationParams {
  spool_id?: number
  printer_id?: number
  outcome?: PrintJobOutcome
}

// ─── Drying Sessions ──────────────────────────────────────────────────────────

export interface DryingSessionResponse {
  id: number
  spool_id: number
  drying_temp: number
  target_duration_hours: number
  humidity_before: number | null
  humidity_after: number | null
  notes: string | null
  started_at: string
  finished_at: string | null
}

export interface DryingSessionCreate {
  drying_temp: number
  target_duration_hours: number
  humidity_before?: number
  notes?: string
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface UsageSummary {
  total_used_g: number
  avg_daily_g: number
  total_spend: number
  spools_depleted: number
  period_days: number
}

export interface SpoolForecast {
  spool_id: number
  spool_name: string
  remaining_g: number
  fill_pct: number
  avg_daily_g: number
  days_remaining: number | null
  estimated_runout: string | null
  severity: AlertSeverity
}

// ─── Alert Rules ──────────────────────────────────────────────────────────────

export interface AlertRule {
  id: number
  name: string
  low_threshold_pct: number
  critical_threshold_pct: number
  material_filter: string | null
  notify_discord: boolean
  notify_email: boolean
  is_active: boolean
  created_at: string
}

export interface AlertRuleCreate {
  name: string
  low_threshold_pct: number
  critical_threshold_pct: number
  material_filter?: string
  notify_discord?: boolean
  notify_email?: boolean
}

// ─── Data Import/Export ───────────────────────────────────────────────────────

export interface ImportResult {
  spools_created: number
  brands_created: number
  filaments_created: number
}
