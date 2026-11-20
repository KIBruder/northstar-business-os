import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFinancePolicy } from '../finance-policy.js';

test('only confirmed paid affiliate revenue creates the fixed 2% budget', () => {
  const r = calculateFinancePolicy({ transactions: [
    { type: 'income', incomeKind: 'affiliate_payout', amount: 100, confirmed: true },
    { type: 'income', incomeKind: 'affiliate_payout', amount: 500, confirmed: false },
    { type: 'income', incomeKind: 'other', amount: 900, confirmed: true }
  ] });
  assert.equal(r.affiliateRevenue, 100);
  assert.equal(r.growthBudgetTotal, 2);
  assert.equal(r.maxNewGrowthSpend, 2);
});

test('seed capital and other income do not create growth budget', () => {
  const r = calculateFinancePolicy({ transactions: [
    { type: 'income', incomeKind: 'other', amount: 500, confirmed: true }
  ], seedCapital: 20, protectedReserve: 3 });
  assert.equal(r.affiliateRevenue, 0);
  assert.equal(r.growthBudgetTotal, 0);
});

test('growth spending reduces the remaining 2% budget', () => {
  const r = calculateFinancePolicy({ transactions: [
    { type: 'income', incomeKind: 'affiliate_payout', amount: 1000, confirmed: true },
    { type: 'expense', costKind: 'growth', amount: 7, confirmed: true }
  ] });
  assert.equal(r.growthBudgetTotal, 20);
  assert.equal(r.growthBudgetAvailable, 13);
  assert.equal(r.maxNewGrowthSpend, 13);
});

test('reserve gate blocks paid growth spending when cash is below reserve', () => {
  const r = calculateFinancePolicy({ transactions: [
    { type: 'income', incomeKind: 'affiliate_payout', amount: 100, confirmed: true },
    { type: 'expense', costKind: 'operating', amount: 119, confirmed: true }
  ], seedCapital: 20, protectedReserve: 3 });
  assert.equal(r.cashBalance, 1);
  assert.equal(r.reserveProtected, false);
  assert.equal(r.maxNewGrowthSpend, 0);
});

test('pending revenue and unconfirmed expenses do not affect cash or budget', () => {
  const r = calculateFinancePolicy({ transactions: [
    { type: 'income', incomeKind: 'affiliate_payout', amount: 1000, confirmed: false },
    { type: 'expense', costKind: 'growth', amount: 10, confirmed: false }
  ], seedCapital: 20, protectedReserve: 3 });
  assert.equal(r.cashBalance, 20);
  assert.equal(r.growthBudgetTotal, 0);
  assert.equal(r.maxNewGrowthSpend, 0);
});

test('growth budget cannot exceed cash available above protected reserve', () => {
  const r = calculateFinancePolicy({ transactions: [
    { type: 'income', incomeKind: 'affiliate_payout', amount: 1000, confirmed: true },
    { type: 'expense', costKind: 'operating', amount: 1015, confirmed: true }
  ], seedCapital: 20, protectedReserve: 3 });
  assert.equal(r.cashBalance, 5);
  assert.equal(r.spendableCash, 2);
  assert.equal(r.maxNewGrowthSpend, 2);
});
