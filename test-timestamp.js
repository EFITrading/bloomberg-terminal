const t = 1770008400000;
const d = new Date(t);
console.log('Timestamp:', t);
console.log('Date object:', d);
console.log('ISO:', d.toISOString());
console.log('Local:', d.toLocaleString());

const year = d.getFullYear();
const month = d.getMonth() + 1;
const day = d.getDate();
const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
console.log('Formatted (local):', dateStr);

// Also check UTC
const yearUTC = d.getUTCFullYear();
const monthUTC = d.getUTCMonth() + 1;
const dayUTC = d.getUTCDate();
const dateStrUTC = `${yearUTC}-${String(monthUTC).padStart(2, '0')}-${String(dayUTC).padStart(2, '0')}`;
console.log('Formatted (UTC):', dateStrUTC);
