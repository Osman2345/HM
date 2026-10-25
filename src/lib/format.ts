export const formatCurrency = (value: number, currency = 'SLL'): string => {
  const locale = 'en-SL';
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  });

  return formatter.format(value);
};

export const formatDate = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat('en-SL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const formatNights = (checkIn: string, checkOut: string): number => {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diff = end.getTime() - start.getTime();

  return Math.max(Math.round(diff / 86400000), 1);
};
