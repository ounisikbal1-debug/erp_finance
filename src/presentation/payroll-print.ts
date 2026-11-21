export function printPayslip(target: HTMLElement | null): void {
  if (!target) return;

  const cleanup = () => {
    target.classList.remove('safe-payslip-print-target');
    document.body.classList.remove('safe-payslip-printing');
  };

  target.classList.add('safe-payslip-print-target');
  document.body.classList.add('safe-payslip-printing');
  window.addEventListener('afterprint', cleanup, { once: true });

  try {
    window.print();
  } catch (error) {
    window.removeEventListener('afterprint', cleanup);
    cleanup();
    throw error;
  }
}
