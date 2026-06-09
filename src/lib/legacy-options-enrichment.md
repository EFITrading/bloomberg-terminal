# Legacy: Server-side enrichment helpers

These server-side enrichment implementations were removed from `optionsFlowService.ts` to avoid large server-side enrichment runs that could exceed deployment timeouts (Vercel `maxDuration`) and to enforce client-side post-scan enrichment for large ALL scans. The implementations are preserved here for reference.

---

## enrichTradesInstantlyParallel (archived)

```ts
// [PROC] INSTANT ENRICHMENT: Add Vol/OI/Greeks/Current Price to trades after worker scan (PARALLEL VERSION)
private async enrichTradesInstantlyParallel(trades: ProcessedTrade[]): Promise<ProcessedTrade[]> {
  // ...implementation archived for reference (moved from optionsFlowService.ts)
}
```

## enrichTradesInstantly (archived)

```ts
// [OPT] INSTANT ENRICHMENT: Add Vol/OI/Greeks/Current Price to trades after worker scan
private async enrichTradesInstantly(trades: ProcessedTrade[]): Promise<ProcessedTrade[]> {
  // ...implementation archived for reference (moved from optionsFlowService.ts)
}
```

## enrichTradesWithVolOIParallel (archived)

```ts
// [FAST] ULTRA-FAST PARALLEL ENRICHMENT - Enriches trades with Vol/OI + Fill Style
async enrichTradesWithVolOIParallel(trades: ProcessedTrade[]): Promise<ProcessedTrade[]> {
  // ...implementation archived for reference (moved from optionsFlowService.ts)
}
```

## enrichTradesWithHistoricalVolOI (archived)

```ts
// Enrich trades with historical Vol/OI data
async enrichTradesWithHistoricalVolOI(trades: ProcessedTrade[]): Promise<ProcessedTrade[]> {
  // ...implementation archived for reference (moved from optionsFlowService.ts)
}
```

---

If you prefer full deletion instead of archiving, I can remove this file and the deprecated stubs. Alternatively, I can add runtime gating to re-enable server-side enrichment for small single-ticker requests.
