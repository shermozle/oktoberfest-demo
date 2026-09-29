/* ==========================================================================
   Laneway Bank demo — lending maths

   Shared by the two calculators and the application's instant decision, so
   a borrowing power shown on the calculator is the same number the
   application tests against. The figures are plausible, not a credit model:
   Australian income tax and Medicare levy, a living-expense floor standing
   in for the HEM benchmark, and serviceability at the product rate plus the
   assessment buffer.
   ========================================================================== */

(function () {
  'use strict';

  const cfg = window.LANEWAY_CONFIG || {};

  const PERIODS = { monthly: 12, fortnightly: 26, weekly: 52 };

  // Repayment per period. Interest-only pays just the interest; principal and
  // interest is the standard amortising payment.
  function repayment(principal, ratePct, years, frequency, type) {
    const n = PERIODS[frequency] || 12;
    const r = ratePct / 100 / n;
    const periods = years * n;
    if (!principal || principal <= 0) return 0;
    if (type === 'interest_only') return principal * r;
    if (r === 0) return principal / periods;
    return (principal * r) / (1 - Math.pow(1 + r, -periods));
  }

  function totalInterest(principal, ratePct, years, frequency, type) {
    const n = PERIODS[frequency] || 12;
    const each = repayment(principal, ratePct, years, frequency, type);
    if (type === 'interest_only') return each * years * n;
    return Math.max(0, each * years * n - principal);
  }

  // Resident income tax for 2026–27, plus the 2% Medicare levy.
  function incomeTax(gross) {
    const g = Math.max(0, gross);
    let tax = 0;
    if (g > 190000) tax = 51370 + (g - 190000) * 0.45;
    else if (g > 135000) tax = 31020 + (g - 135000) * 0.37;
    else if (g > 45000) tax = 4020 + (g - 45000) * 0.3;
    else if (g > 18200) tax = (g - 18200) * 0.15;
    return tax + g * 0.02;
  }

  // Monthly living-expense floor. Lenders assess the higher of what you
  // declare and a benchmark like this.
  function expenseFloor(applicants, dependants) {
    return (applicants > 1 ? 2450 : 1650) + 420 * (dependants || 0);
  }

  const assessmentRate = (ratePct) => ratePct + (cfg.ASSESSMENT_BUFFER ?? 3);

  /**
   * Estimated maximum loan. `input`:
   *   applicants      1 or 2
   *   income          applicant 1 gross annual income
   *   partnerIncome   applicant 2 gross annual income
   *   otherIncome     rent, dividends etc., annual (counted at 80%)
   *   dependants
   *   expenses        declared monthly living expenses
   *   debts           other monthly loan repayments
   *   cardLimits      total credit card limits (assessed at 3.8% a month)
   *   rate            product rate, % p.a.
   */
  function borrowingPower(input) {
    const applicants = Number(input.applicants) > 1 ? 2 : 1;
    const incomes = [Number(input.income) || 0];
    if (applicants > 1) incomes.push(Number(input.partnerIncome) || 0);
    const other = (Number(input.otherIncome) || 0) * 0.8;

    const netAnnual =
      incomes.reduce((sum, g) => sum + g - incomeTax(g), 0) + other * 0.7;
    const netMonthly = netAnnual / 12;

    const living = Math.max(
      Number(input.expenses) || 0,
      expenseFloor(applicants, Number(input.dependants) || 0)
    );
    const commitments =
      (Number(input.debts) || 0) + (Number(input.cardLimits) || 0) * 0.038;

    const surplus = netMonthly - living - commitments;
    if (surplus <= 0) return 0;

    const years = cfg.LOAN_TERM_YEARS || 30;
    const r = assessmentRate(Number(input.rate) || 6) / 100 / 12;
    const pv = (surplus * (1 - Math.pow(1 + r, -years * 12))) / r;
    return Math.floor(pv / 1000) * 1000;
  }

  const lvr = (loan, value) =>
    value > 0 ? Math.round((loan / value) * 1000) / 10 : null;

  // Analytics and engagement tools get bands, not exact figures: enough to
  // segment on, without shipping someone's salary to two more systems.
  function band(n, edges, unit) {
    const v = Number(n) || 0;
    for (let i = 0; i < edges.length; i++) {
      if (v < edges[i]) {
        const lo = i === 0 ? 0 : edges[i - 1];
        return (lo ? fmt(lo, unit) : 'under ') + (lo ? '–' : '') + fmt(edges[i], unit);
      }
    }
    return fmt(edges[edges.length - 1], unit) + '+';
  }

  function fmt(n, unit) {
    if (unit === 'k') return '$' + n / 1000 + 'k';
    if (unit === 'm') return n >= 1e6 ? '$' + n / 1e6 + 'm' : '$' + n / 1000 + 'k';
    return String(n);
  }

  const incomeBand = (n) => band(n, [50000, 100000, 150000, 200000, 300000], 'k');
  const loanBand = (n) => band(n, [300000, 500000, 750000, 1000000, 1500000], 'm');

  window.LanewayFinance = {
    PERIODS,
    repayment,
    totalInterest,
    incomeTax,
    expenseFloor,
    assessmentRate,
    borrowingPower,
    lvr,
    incomeBand,
    loanBand,
  };
})();
