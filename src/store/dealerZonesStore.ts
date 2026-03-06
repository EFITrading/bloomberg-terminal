import { create } from 'zustand'

export interface DealerZoneEntry {
  golden: number | null
  purple: number | null
  atmIV: number | null
  goldenDetail: { strike: number; expiry: string; net: number } | null
  purpleDetail: { strike: number; expiry: string; net: number } | null
  /** True when computed with live WebSocket OI — values may differ from snapshot API */
  isLive: boolean
  updatedAt: number
}

interface DealerZonesState {
  zones: Record<string, DealerZoneEntry>
  setZone: (ticker: string, zone: Omit<DealerZoneEntry, 'updatedAt'>) => void
  getZone: (ticker: string) => DealerZoneEntry | null
}

/** Max age before a DealerAttraction-written zone is considered stale (5 min) */
const STALE_MS = 5 * 60 * 1000

export const useDealerZonesStore = create<DealerZonesState>((set, get) => ({
  zones: {},

  setZone: (ticker, zone) =>
    set((state) => ({
      zones: { ...state.zones, [ticker.toUpperCase()]: { ...zone, updatedAt: Date.now() } },
    })),

  getZone: (ticker) => {
    const entry = get().zones[ticker.toUpperCase()]
    if (!entry) return null
    if (Date.now() - entry.updatedAt > STALE_MS) return null
    return entry
  },
}))
