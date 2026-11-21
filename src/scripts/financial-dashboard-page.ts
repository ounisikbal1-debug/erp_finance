import { calculateDashboardSummary } from '../application/modules/advanced-finance/dashboard';

export type FinancialDashboardSnapshot = ReturnType<typeof calculateDashboardSummary>;

function htmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function jsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function financialDashboardCsv(snapshot: FinancialDashboardSnapshot, monthCount = 12): string {
  const monthly = snapshot.monthly.slice(-monthCount);
  const csvText = (value: string | number) => {
    const text = String(value);
    const safeValue = typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeValue.replace(/"/g, '""')}"`;
  };
  const rows = [
    ['Entité', 'Période', 'Devise', 'Revenus comptabilisés', 'Charges comptabilisées'],
    ...monthly.map((month) => [
      snapshot.entity.name,
      month.month,
      snapshot.entity.currencyCode,
      month.revenue === null ? '' : month.revenue,
      month.expenses === null ? '' : month.expenses,
    ]),
  ];
  return rows.map((row) => row.map(csvText).join(';')).join('\r\n');
}

export function renderFinancialDashboardPage(
  snapshots: readonly FinancialDashboardSnapshot[],
  workbookFilename = 'SAFE - Tableau de bord financier.xlsx',
  displayLabel?: string,
): string {
  if (snapshots.length === 0) throw new Error('Aucune entité SAFE à afficher.');

  const safeData = jsonForHtml(snapshots);
  const labelMarkup = displayLabel
    ? `<p class="stamp"><strong>${htmlAttribute(displayLabel)}</strong></p>`
    : '';
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SAFE — Tableau de bord financier</title>
  <style>
    :root{font-family:Segoe UI,Arial,sans-serif;color:#14243a;background:#f3f6fa;font-synthesis:none}
    *{box-sizing:border-box}body{margin:0}main{max-width:1180px;margin:auto;padding:32px 22px 56px}
    header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:24px}
    h1{font-size:clamp(25px,4vw,36px);margin:0 0 8px;letter-spacing:-.03em}
    p{color:#607086;line-height:1.55;margin:6px 0}.stamp{font-size:13px}
    .controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    select,button,.excel-link{font:inherit;border:1px solid #cbd6e2;border-radius:9px;padding:10px 12px;background:white;color:#14243a}
    button{cursor:pointer;font-weight:600}button:hover{border-color:#2870c8}
    .excel-link{font-weight:600;text-decoration:none}.excel-link:hover{border-color:#2870c8}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:13px;margin:20px 0}
    .card,.panel,.notice{background:#fff;border:1px solid #e1e8f0;border-radius:14px;box-shadow:0 3px 12px #1632510a}
    .card{padding:18px}.card-label{color:#607086;font-size:13px}.card-value{font-size:23px;font-weight:700;margin-top:8px;overflow-wrap:anywhere}
    .panel{padding:20px;margin:16px 0}.panel h2{font-size:18px;margin:0 0 6px}
    #chart{width:100%;height:auto;min-height:220px;display:block;margin-top:12px}
    .legend{display:flex;gap:20px;font-size:13px;color:#607086}.legend span:before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px;background:#2563eb}
    .legend span:last-child:before{background:#e28a21}
    .notice{padding:16px 18px;border-left:4px solid #e2a025}.notice h2{font-size:16px;margin:0 0 6px}
    .coverage{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px}
    .coverage-item{padding:12px;border-radius:9px;background:#f5f8fc;font-size:13px;color:#43556c}
    .table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px;margin-top:12px}
    th,td{text-align:right;padding:10px;border-bottom:1px solid #e8edf3;white-space:nowrap}th:first-child,td:first-child{text-align:left}
    footer{font-size:12px;color:#6b7b8e;margin-top:24px}
    @media(max-width:650px){main{padding:22px 14px}header{display:block}.controls{margin-top:16px}.panel{padding:15px}}
    @media print{body{background:#fff}main{max-width:none;padding:0}.controls{display:none}.card,.panel,.notice{box-shadow:none;break-inside:avoid}}
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Tableau de bord financier SAFE</h1>
      ${labelMarkup}
      <p>Indicateurs calculés à partir des écritures comptables et données opérationnelles SAFE.</p>
      <p class="stamp" id="generated-at"></p>
    </div>
    <div class="controls">
      <label for="entity-select">Entité</label><select id="entity-select"></select>
      <label for="period-select">Période</label>
      <select id="period-select"><option value="3">3 mois</option><option value="6">6 mois</option><option value="12" selected>12 mois</option></select>
      <button id="download-csv" type="button">Télécharger CSV</button>
      <a class="excel-link" href="${htmlAttribute(workbookFilename)}" download>Télécharger Excel</a>
      <button id="print" type="button">Imprimer</button>
    </div>
  </header>
  <section class="cards" id="kpis" aria-label="Indicateurs financiers"></section>
  <section class="panel">
    <h2>Revenus et charges comptabilisés</h2>
    <p>Écritures postées, par mois. La période et l'entité peuvent être filtrées.</p>
    <div class="legend"><span>Revenus</span><span>Charges</span></div>
    <svg id="chart" viewBox="0 0 900 300" role="img" aria-label="Graphique mensuel des revenus et charges"></svg>
    <div class="table-wrap"><table><thead><tr><th>Mois</th><th>Revenus</th><th>Charges</th></tr></thead><tbody id="monthly-rows"></tbody></table></div>
  </section>
  <section class="panel">
    <h2>Qualité et couverture des données</h2>
    <p>Les indicateurs incomplets ne sont pas remplacés par des estimations.</p>
    <div class="coverage" id="coverage"></div>
  </section>
  <section class="notice">
    <h2>Indicateurs du classeur Excel non publiés</h2>
    <p>Les ratios de liquidité, structure de dette, rentabilité avancée (ROE/ROA/ROCE), BFR/DSO/DPO, rotation des stocks et valeur ajoutée ne sont pas calculés dans cet export. Leurs formules doivent être rapprochées de sources comptables complètes et de règles de classement vérifiées avant affichage. Aucune hypothèse ni donnée fictive n'est utilisée pour les remplacer.</p>
  </section>
  <footer>
    Copie locale générée depuis SAFE ; il s'agit d'un instantané à la date indiquée, non d'une connexion en temps réel. Pour actualiser les données, relancez <code>npm run dashboard:export</code> depuis le dossier du projet. Les valeurs sont exprimées dans la devise de l'entité.
  </footer>
</main>
<script id="snapshot-data" type="application/json">${safeData}</script>
<script>
(() => {
  const data = JSON.parse(document.getElementById('snapshot-data').textContent);
  const entitySelect = document.getElementById('entity-select');
  const periodSelect = document.getElementById('period-select');
  const kpis = document.getElementById('kpis');
  const chart = document.getElementById('chart');
  const monthlyRows = document.getElementById('monthly-rows');
  const coverage = document.getElementById('coverage');
  const numberFormat = (value, currency) => value === null
    ? 'Indisponible'
    : new Intl.NumberFormat('fr-FR', {style:'currency', currency, maximumFractionDigits:3}).format(value);
  const addText = (parent, tag, text, className) => {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    parent.appendChild(element);
    return element;
  };
  data.forEach((snapshot, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = snapshot.entity.name + ' (' + snapshot.entity.currencyCode + ')';
    entitySelect.appendChild(option);
  });
  document.getElementById('generated-at').textContent = 'Instantané du ' + new Date(data[0].generatedAt).toLocaleString('fr-FR');
  const metric = (label, value, currency) => {
    const card = document.createElement('article');
    card.className = 'card';
    addText(card, 'div', label, 'card-label');
    addText(card, 'div', currency ? numberFormat(value, currency) : value === null ? 'Indisponible' : new Intl.NumberFormat('fr-FR').format(value), 'card-value');
    return card;
  };
  const makePath = (points, key, x, y) => {
    let active = false;
    return points.map((point, index) => {
      if (point[key] === null) { active = false; return ''; }
      const command = active ? 'L' : 'M';
      active = true;
      return command + x(index).toFixed(2) + ',' + y(point[key]).toFixed(2);
    }).join(' ');
  };
  function renderChart(snapshot, count) {
    const points = snapshot.monthly.slice(-count);
    const values = points.flatMap((point) => [point.revenue, point.expenses]).filter(Number.isFinite);
    chart.replaceChildren();
    if (values.length === 0) {
      addText(chart, 'text', 'Aucune série complète à afficher', '');
      return;
    }
    const low = Math.min(0, ...values);
    const high = Math.max(0, ...values);
    const spread = high - low || 1;
    const left = 58, right = 18, top = 18, bottom = 42, width = 900, height = 300;
    const x = (index) => left + index * (width - left - right) / Math.max(points.length - 1, 1);
    const y = (value) => top + (high - value) * (height - top - bottom) / spread;
    for (let index = 0; index <= 4; index += 1) {
      const value = high - spread * index / 4;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(left)); line.setAttribute('x2', String(width - right));
      line.setAttribute('y1', y(value).toFixed(2)); line.setAttribute('y2', y(value).toFixed(2));
      line.setAttribute('stroke', '#e7edf4'); chart.appendChild(line);
      const axisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      axisLabel.setAttribute('x', String(left - 8)); axisLabel.setAttribute('y', (y(value) + 4).toFixed(2));
      axisLabel.setAttribute('text-anchor', 'end'); axisLabel.setAttribute('fill', '#607086');
      axisLabel.setAttribute('font-size', '11');
      axisLabel.textContent = new Intl.NumberFormat('fr-FR', {maximumFractionDigits:0}).format(value);
      chart.appendChild(axisLabel);
    }
    const paths = [
      {key:'revenue', color:'#2563eb'},
      {key:'expenses', color:'#e28a21'},
    ];
    paths.forEach((series) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', makePath(points, series.key, x, y));
      path.setAttribute('fill', 'none'); path.setAttribute('stroke', series.color);
      path.setAttribute('stroke-width', '3'); path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round'); chart.appendChild(path);
      points.forEach((point, index) => {
        if (!Number.isFinite(point[series.key])) return;
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x(index).toFixed(2)); dot.setAttribute('cy', y(point[series.key]).toFixed(2));
        dot.setAttribute('r', '4'); dot.setAttribute('fill', series.color);
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = point.month + ': ' + numberFormat(point[series.key], snapshot.entity.currencyCode);
        dot.appendChild(title); chart.appendChild(dot);
      });
    });
    points.forEach((point, index) => {
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', x(index).toFixed(2)); label.setAttribute('y', String(height - 12));
      label.setAttribute('text-anchor', 'middle'); label.setAttribute('fill', '#607086');
      label.setAttribute('font-size', '11'); label.textContent = point.month.slice(2);
      chart.appendChild(label);
    });
  }
  function render() {
    const snapshot = data[Number(entitySelect.value) || 0];
    const currency = snapshot.entity.currencyCode;
    kpis.replaceChildren(
      metric('Revenus postés (12 mois)', snapshot.kpis.postedRevenue, currency),
      metric('Charges postées (12 mois)', snapshot.kpis.postedExpenses, currency),
      metric('Différence d’exploitation', snapshot.kpis.operatingDifference, currency),
      metric('Factures émises', snapshot.kpis.issuedInvoiceAmount, currency),
      metric('Nombre de factures émises', snapshot.kpis.issuedInvoiceCount, null),
      metric('Stock au coût enregistré', snapshot.kpis.inventoryAtCost, currency)
    );
    const count = Number(periodSelect.value);
    const rows = snapshot.monthly.slice(-count);
    renderChart(snapshot, count);
    monthlyRows.replaceChildren();
    rows.forEach((point) => {
      const row = document.createElement('tr');
      addText(row, 'td', point.month);
      addText(row, 'td', numberFormat(point.revenue, currency));
      addText(row, 'td', numberFormat(point.expenses, currency));
      monthlyRows.appendChild(row);
    });
    coverage.replaceChildren();
    const items = [
      'Écritures postées consultées : ' + snapshot.coverage.postedJournalLineCount,
      'Comptes de produits / charges classés : ' + snapshot.coverage.revenueAccountCount + ' / ' + snapshot.coverage.expenseAccountCount,
      'Lignes non classées : ' + snapshot.coverage.unclassifiedJournalLineCount,
      'Lignes avec montants invalides : ' + snapshot.coverage.invalidJournalLineCount,
      'Factures non calculables : ' + snapshot.coverage.invalidInvoiceCount,
      'Articles de stock non calculables : ' + snapshot.coverage.invalidMaterialCount
    ];
    items.forEach((item) => addText(coverage, 'div', item, 'coverage-item'));
  }
  entitySelect.addEventListener('change', render);
  periodSelect.addEventListener('change', render);
  document.getElementById('print').addEventListener('click', () => window.print());
  document.getElementById('download-csv').addEventListener('click', () => {
    const snapshot = data[Number(entitySelect.value) || 0];
    const count = Number(periodSelect.value);
    const text = [
      ['Entité', 'Période', 'Devise', 'Revenus comptabilisés', 'Charges comptabilisées'],
      ...snapshot.monthly.slice(-count).map((point) => [
        snapshot.entity.name, point.month, snapshot.entity.currencyCode,
        point.revenue === null ? '' : String(point.revenue),
        point.expenses === null ? '' : String(point.expenses)
      ])
    ].map((row) => row.map((value, index) => {
      const cell = String(value);
      const safe = index < 3 && /^[\\t\\r\\n ]*[=+\\-@]/.test(cell) ? "'" + cell : cell;
      return '"' + safe.replace(/"/g, '""') + '"';
    }).join(';')).join('\\r\\n');
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob(['\\ufeff' + text], {type:'text/csv;charset=utf-8'}));
    link.href = url;
    link.download = 'SAFE-financier-' + snapshot.entity.currencyCode + '.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  render();
})();
</script>
</body>
</html>`;
}
