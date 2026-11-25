import { DateTime } from 'luxon'

/** ` '27`: the target's year in its own zone, as the header writes it after the name. */
export function yearSuffix(targetAt: string, zone: string): string {
  return ` '${String(DateTime.fromISO(targetAt, { zone }).year).slice(-2)}`
}

/** `2027-06-24`: the target's calendar day in its own zone. */
export function targetDay(targetAt: string, zone: string): string {
  return DateTime.fromISO(targetAt, { zone }).toISODate() ?? ''
}
