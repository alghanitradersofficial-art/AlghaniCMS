export function fmt(n: number, decimals = 2): string {
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtCurrency(n: number): string {
  return `PKR ${fmt(n)}`;
}

export function fmtDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: string | Date): string {
  return new Date(d).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

export function getMonthYear(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return { year: d.getFullYear(), month: d.getMonth() + 1, monthName: MONTH_NAMES[d.getMonth()] };
}
