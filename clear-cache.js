// Quick script to clear the seasonal opportunities cache and force fresh data loading
// Run this in browser console on localhost:3001 to clear fake data

console.log("🧹 Clearing seasonal opportunities cache...");

// Clear localStorage cache
try {
  localStorage.removeItem('bloomberg-cache-SEASONAL_OPPORTUNITIES');
  console.log("✅ Cleared localStorage cache");
} catch (e) {
  console.log("ℹ️ No localStorage cache found");
}

// Clear sessionStorage cache  
try {
  sessionStorage.removeItem('bloomberg-cache-SEASONAL_OPPORTUNITIES');
  console.log("✅ Cleared sessionStorage cache");
} catch (e) {
  console.log("ℹ️ No sessionStorage cache found");
}

// Clear any global cache if it exists
try {
  if (window.GlobalDataCache) {
    window.GlobalDataCache.getInstance().clear();
    console.log("✅ Cleared global data cache");
  }
} catch (e) {
  console.log("ℹ️ No global cache found");
}

console.log("🔄 Cache cleared! Refresh the page to load fresh real data.");
