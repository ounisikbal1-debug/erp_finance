export const LOGIN_ACCOUNT_TYPES = [
  { value: 'ADMIN', role: 'ADMIN', username: 'admin' },
  { value: 'FINANCIAL_MANAGER', role: 'FINANCIAL_MANAGER', username: 'finmgr' },
  { value: 'ACCOUNTANT', role: 'ACCOUNTANT', username: 'accountant' },
  { value: 'SUPPLIER_ACCOUNTS_CLERK', role: 'ACCOUNTANT', username: 'supplier.accounts' },
  { value: 'HR_MANAGER', role: 'HR_MANAGER', username: 'hrmgr' },
  { value: 'SALES_OFFICER', role: 'SALES_OFFICER', username: 'salesmgr' },
  { value: 'CUSTOMER_ACCOUNTS_CLERK', role: 'SALES_OFFICER', username: 'customer.accounts' },
  { value: 'LOGISTICS_MGR', role: 'LOGISTICS_MGR', username: 'logistics' },
] as const;

export type LoginAccountType = (typeof LOGIN_ACCOUNT_TYPES)[number]['value'];

export function getLoginAccountRole(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return LOGIN_ACCOUNT_TYPES.find((accountType) => accountType.value === value)?.role ?? null;
}
