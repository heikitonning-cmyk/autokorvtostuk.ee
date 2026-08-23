export type UserRole = 'manager' | 'operator'
export type JobStatus = 'uus' | 'kinnitatud' | 'teel' | 'toob' | 'tehtud' | 'vajab_jareltegevust' | 'tuhistatud'
export type InvoiceStatus = 'puudub' | 'valmis_arveks' | 'arveldatud'

export interface AppUser {
  id: string
  name: string
  email: string
  phone?: string | null
  role: UserRole
  active: boolean
}

export interface Customer {
  id: string
  type: 'person' | 'company'
  name: string
  registryCode?: string | null
  contactName?: string | null
  phone?: string | null
  email?: string | null
  billingAddress?: string | null
  notes?: string | null
}

export interface WorkType {
  id: string
  name: string
  active: boolean
  defaultNotes?: string | null
}

export interface PriceSettings {
  hourlyRate: number
  minimumOrder: number
  driveHourlyRate: number
  kmRate: number
  helperHourlyRate: number
}

export interface PriceSnapshot extends PriceSettings {
  capturedAt: string
}

export interface PriceInput {
  liftHours: number
  driveHours: number
  km: number
  helperHours: number
  adjustment: number
}

export interface PriceBreakdown {
  lift: number
  drive: number
  distance: number
  helper: number
  adjustment: number
  subtotal: number
  total: number
}

export interface Job {
  id: string
  customerId?: string | null
  vehicleId?: string | null
  operatorId?: string | null
  startPlanned?: string | null
  endPlanned?: string | null
  address?: string | null
  objectName?: string | null
  workTypeId?: string | null
  description?: string | null
  accessNotes?: string | null
  status: JobStatus
  priceSnapshot?: PriceSnapshot | null
  estimatedTotal?: number | null
  actualStart?: string | null
  actualEnd?: string | null
  actualKm?: number | null
  helperUsed: boolean
  helperHours?: number | null
  extraWorkDescription?: string | null
  actualTotal?: number | null
  invoiceStatus: InvoiceStatus
}
