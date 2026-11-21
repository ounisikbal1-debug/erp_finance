export function calculateRetirementCssGain(
  grossSalary: number,
  monthlyRetirementBenefit: number,
  cssRatePercent: number,
) {
  const cssBeforeRetirementGain = Math.round((grossSalary * (cssRatePercent / 100)) * 1000) / 1000;
  const css = Math.round((
    Math.max(0, grossSalary - Math.max(0, monthlyRetirementBenefit))
    * (cssRatePercent / 100)
  ) * 1000) / 1000;

  return {
    cssBeforeRetirementGain,
    css,
    gainCss: Math.max(0, Math.round((cssBeforeRetirementGain - css) * 1000) / 1000),
  };
}
