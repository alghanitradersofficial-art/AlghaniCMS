type CustomerLike = {
  id: number;
  name?: string | null;
};

type SaleLike = {
  customerId?: number | null;
  customerName?: string | null;
  status?: string | null;
  total?: string | number | null;
};

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

export function buildCustomerMetricsMap(sales: SaleLike[], customers: CustomerLike[]) {
  const metricsByCustomerId = new Map<number, { totalOrders: number; totalSpent: number }>();

  for (const customer of customers) {
    metricsByCustomerId.set(customer.id, { totalOrders: 0, totalSpent: 0 });
  }

  for (const sale of sales) {
    const status = normalizeText(sale.status);
    if (status === "cancelled" || status === "void") continue;

    const saleCustomerId = sale.customerId != null ? Number(sale.customerId) : null;
    const saleCustomerName = normalizeText(sale.customerName);

    for (const customer of customers) {
      const customerName = normalizeText(customer.name);
      const matchesCustomerId = saleCustomerId !== null && saleCustomerId === customer.id;
      const matchesCustomerName = saleCustomerId === null && Boolean(customerName) && Boolean(saleCustomerName) && customerName === saleCustomerName;

      if (!matchesCustomerId && !matchesCustomerName) continue;

      const metrics = metricsByCustomerId.get(customer.id);
      if (!metrics) continue;

      metrics.totalOrders += 1;
      metrics.totalSpent += Number(sale.total ?? 0);
      break;
    }
  }

  return metricsByCustomerId;
}
