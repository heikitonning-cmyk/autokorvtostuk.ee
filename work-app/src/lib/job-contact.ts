type ContactJob = { contact_phone?: string | null; customer?: { phone?: string | null } | null; website_booking_details?: { phone?: unknown } | null }

export function phoneHref(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[+\d\s().-]+$/.test(value.trim())) return null
  const compact = value.trim().replace(/[\s().-]/g, '').replace(/^00/, '+')
  return /^\+?\d{3,20}$/.test(compact) ? `tel:${compact}` : null
}

export function jobPhoneHref(job: ContactJob): string | null {
  return phoneHref(job.contact_phone) ?? phoneHref(job.website_booking_details?.phone) ?? phoneHref(job.customer?.phone)
}
