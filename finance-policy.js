export const GROWTH_RATE = 0.02;

export function calculateFinancePolicy({ transactions = [], seedCapital = 20, protectedReserve = 3 } = {}) {
  const validAmount = row => Number.isFinite(Number(row.amount)) && Number(row.amount) > 0;
  const confirmed = transactions.filter(row => row.confirmed && validAmount(row));
  const affiliateRevenue = confirmed
    .filter(row => row.type === 'income' && row.incomeKind === 'affiliate_payout')
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const income = confirmed.filter(row => row.type === 'income')
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const expenses = confirmed.filter(row => row.type === 'expense')
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const growthSpend = confirmed
    .filter(row => row.type === 'expense' && row.costKind === 'growth')
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const safeSeed = Number.isFinite(Number(seedCapital)) ? Math.max(0, Number(seedCapital)) : 0;
  const safeReserve = Number.isFinite(Number(protectedReserve)) ? Math.max(0, Number(protectedReserve)) : 0;
  const cashBalance = safeSeed + income - expenses;
  const spendableCash = Math.max(0, cashBalance - safeReserve);
  const growthBudgetTotal = affiliateRevenue * GROWTH_RATE;
  const growthBudgetAvailable = Math.max(0, growthBudgetTotal - growthSpend);
  const reserveProtected = cashBalance >= safeReserve;
  const maxNewGrowthSpend = reserveProtected ? Math.min(growthBudgetAvailable, spendableCash) : 0;
  return { seedCapital: safeSeed, protectedReserve: safeReserve, income, affiliateRevenue,
    expenses, growthSpend, cashBalance, spendableCash, growthBudgetTotal,
    growthBudgetAvailable, reserveProtected, maxNewGrowthSpend, profit: income - expenses };
}
