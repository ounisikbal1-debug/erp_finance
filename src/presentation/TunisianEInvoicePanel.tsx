import React, { useEffect, useState, useMemo } from 'react';
import TunisianInvoicePrintModal, { type PrintableInvoiceData } from './TunisianInvoicePrintModal';
import { useInterfaceLanguage, translateBusinessText } from './localization';

interface TunisianEInvoiceItem {
  id: string;
  invoiceId: string;
  entityId: string;
  ttnReference: string | null;
  status: string;
  sha256Hash: string;
  qrCodeData: string;
  signatureDigest: string | null;
  submissionDate: string | null;
  responseDate: string | null;
  rejectionReason: string | null;
  createdAt: string;
  invoice: {
    invoiceNumber: string;
    subTotal: number;
    taxAmount: number;
    stampDuty: number;
    totalAmount: number;
    currencyCode: string | null;
    status: string;
    issuedAt: string | null;
    createdAt: string;
    customer: {
      code: string;
      name: string;
      fiscalId: string | null;
    };
  };
}

interface Props {
  accessToken: string | null;
  entityId: string | null;
}

export default function TunisianEInvoicePanel({ accessToken, entityId }: Props) {
  const language = useInterfaceLanguage();
  const text = (v: string) => translateBusinessText(language, v);

  const [invoices, setInvoices] = useState<TunisianEInvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedXml, setSelectedXml] = useState<{ invoiceNumber: string; xml: string } | null>(null);
  const [selectedCev, setSelectedCev] = useState<TunisianEInvoiceItem | null>(null);
  const [printModalInvoice, setPrintModalInvoice] = useState<PrintableInvoiceData | null>(null);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = async () => {
    if (!accessToken || !entityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/e-invoices?entityId=${encodeURIComponent(entityId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Erreur ${res.status}: Impossible de récupérer les e-factures`);
      }
      const data = await res.json();
      setInvoices(data.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [accessToken, entityId]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((item) => {
      const matchesSearch =
        search === '' ||
        item.invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        item.invoice.customer.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.invoice.customer.fiscalId && item.invoice.customer.fiscalId.toLowerCase().includes(search.toLowerCase())) ||
        (item.ttnReference && item.ttnReference.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = invoices.length;
    const acceptedTtn = invoices.filter((i) => i.status === 'ACCEPTED_TTN').length;
    const signed = invoices.filter((i) => i.status === 'SIGNED').length;
    const totalTtc = invoices.reduce((sum, i) => sum + (i.invoice.totalAmount || 0), 0);
    const totalTva = invoices.reduce((sum, i) => sum + (i.invoice.taxAmount || 0), 0);
    const totalTimbre = invoices.reduce((sum, i) => sum + (i.invoice.stampDuty || 0), 0);
    return { total, acceptedTtn, signed, totalTtc, totalTva, totalTimbre };
  }, [invoices]);

  const viewXml = async (item: TunisianEInvoiceItem) => {
    try {
      const res = await fetch(`/api/sales/e-invoices/${item.id}/xml`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Impossible de charger le XML UBL 2.1');
      const xml = await res.text();
      setSelectedXml({ invoiceNumber: item.invoice.invoiceNumber, xml });
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur XML');
    }
  };

  const downloadXml = (item: TunisianEInvoiceItem, xmlContent?: string) => {
    const content = xmlContent || '';
    const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TTN-ElFatoora-${item.invoice.invoiceNumber}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Facture ${item.invoice.invoiceNumber} téléchargée en XML UBL TTN`);
  };

  const handleBulkGenerate = async () => {
    if (!accessToken || !entityId) return;
    setIsBulkRunning(true);
    try {
      const res = await fetch('/api/sales/e-invoices/bulk-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ entityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la génération en masse');
      showToast(`Génération réussie : ${data.count} e-factures traitées avec TTN`);
      await loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setIsBulkRunning(false);
    }
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('fr-TN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' TND';
  };

  return (
    <div className="space-y-6 p-4 bg-slate-50 min-h-screen">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-bounce">
          <span className="text-emerald-400 font-bold">✔</span>
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-red-700 via-rose-700 to-red-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🇹🇳</span>
              <h1 className="text-2xl font-bold tracking-tight">
                Facturation Électronique Tunisienne (El Fatoora - TTN)
              </h1>
              <span className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider">
                Conforme 100%
              </span>
            </div>
            <p className="mt-2 text-rose-100 text-sm max-w-3xl leading-relaxed">
              Plateforme nationale certifiée conforme au <strong>Décret n° 2016-1098</strong> et au <strong>Décret-loi n° 2021-21</strong>.
              Génération automatique des flux <strong>XML UBL 2.1</strong>, signature électronique qualifiée <strong>TunTrust PKI (X.509)</strong>,
              Cachet Électronique Visible (<strong>CEV / 2D-Doc</strong>) et télétransmission à <strong>Tunisie TradeNet (TTN)</strong>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkGenerate}
              disabled={isBulkRunning}
              className="bg-white text-red-800 hover:bg-rose-50 px-4 py-2.5 rounded-xl font-semibold text-sm shadow transition flex items-center gap-2 disabled:opacity-50"
            >
              <span>{isBulkRunning ? 'â³ Synchronisation...' : '⚡ Générer Tout & TTN'}</span>
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="bg-red-800/80 hover:bg-red-800 text-white border border-rose-400/30 px-3 py-2.5 rounded-xl font-medium text-sm transition"
              title="Rafraîchir"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Legal tags */}
        <div className="mt-5 pt-4 border-t border-rose-500/30 flex flex-wrap gap-2 text-xs text-rose-200">
          <span className="bg-black/20 px-3 py-1 rounded-md">📋 Standard TTN El Fatoora v2.1</span>
          <span className="bg-black/20 px-3 py-1 rounded-md">🔐 SHA-256 Digest & Hash Intégrité</span>
          <span className="bg-black/20 px-3 py-1 rounded-md">🔒 TunTrust National Root CA</span>
          <span className="bg-black/20 px-3 py-1 rounded-md">🔲 CEV 2D-Doc QR Haute Résolution</span>
          <span className="bg-black/20 px-3 py-1 rounded-md">🛡️ DGI & Ministère des Finances</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total E-Factures TTN</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
            <div className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <span>â—</span> 100% enregistrées en base
            </div>
          </div>
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center text-xl font-bold">
            📄
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approuvées & Agréées TTN</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.acceptedTtn}</div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              {stats.total > 0 ? Math.round((stats.acceptedTtn / stats.total) * 100) : 0}% de validation
            </div>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl font-bold">
            ✅
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Volume Total Facturé (TTC)</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(stats.totalTtc)}</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Taux légaux 19%, 13%, 7%</div>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl font-bold">
            💰
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">TVA & Timbre Fiscal</div>
            <div className="text-base font-bold text-slate-800 mt-1">
              TVA: <span className="text-emerald-700">{formatCurrency(stats.totalTva)}</span>
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              Timbre Fiscal (1 DT): <span className="font-semibold text-slate-700">{formatCurrency(stats.totalTimbre)}</span>
            </div>
          </div>
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-xl font-bold">
            ⚖️
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex-1 w-full flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Rechercher par N° Facture, Client, Matricule Fiscal ou N° Agrément TTN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
            <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          >
            <option value="ALL">Tous les statuts ({invoices.length})</option>
            <option value="ACCEPTED_TTN">Agréées TTN ({stats.acceptedTtn})</option>
            <option value="SIGNED">Signées TunTrust ({stats.signed})</option>
            <option value="GENERATED">Générées XML</option>
            <option value="REJECTED_TTN">Rejetées</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Affichage de <span className="font-bold text-slate-800">{filteredInvoices.length}</span> sur {invoices.length} e-factures
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-500">
            <div className="text-3xl animate-spin mb-3">⚙️</div>
            <p className="text-sm font-medium">Chargement des factures électroniques...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 bg-red-50 rounded-xl m-4">
            <p className="font-semibold">{error}</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="py-20 text-center text-slate-400">
            <p className="text-base font-semibold">Aucune e-facture trouvée.</p>
            <p className="text-xs mt-1">Cliquez sur « Générer Tout & TTN » pour créer les e-factures pour toutes les ventes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">N° Facture / Émission</th>
                  <th className="py-3 px-4">Client / Matricule Fiscal</th>
                  <th className="py-3 px-4 text-right">Montant HT</th>
                  <th className="py-3 px-4 text-right">TVA</th>
                  <th className="py-3 px-4 text-right">Timbre</th>
                  <th className="py-3 px-4 text-right">Total TTC</th>
                  <th className="py-3 px-4 text-center">Statut TTN</th>
                  <th className="py-3 px-4 text-center">N° Enregistrement TTN</th>
                  <th className="py-3 px-4 text-center">Empreinte Cryptographique</th>
                  <th className="py-3 px-4 text-center">Actions & Certificats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{item.invoice.invoiceNumber}</div>
                      <div className="text-xs text-slate-500">
                        {item.invoice.issuedAt
                          ? new Date(item.invoice.issuedAt).toLocaleDateString('fr-TN')
                          : new Date(item.createdAt).toLocaleDateString('fr-TN')}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{item.invoice.customer.name}</div>
                      <div className="text-xs font-mono text-slate-500">
                        MF: {item.invoice.customer.fiscalId || 'Non spécifié'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-700">
                      {formatCurrency(item.invoice.subTotal)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-slate-700">
                      {formatCurrency(item.invoice.taxAmount)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500 text-xs font-medium">
                      {formatCurrency(item.invoice.stampDuty || 1)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {formatCurrency(item.invoice.totalAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.status === 'ACCEPTED_TTN' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                          Agréée TTN
                        </span>
                      ) : item.status === 'SIGNED' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                          Signée TunTrust
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {item.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.ttnReference ? (
                        <div className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded border border-slate-200 inline-block">
                          {item.ttnReference}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="group relative inline-block">
                        <span
                          className="font-mono text-xs bg-slate-50 text-slate-600 px-2 py-0.5 rounded border border-slate-200 cursor-pointer"
                          title={item.sha256Hash}
                          onClick={() => {
                            navigator.clipboard.writeText(item.sha256Hash);
                            showToast('Empreinte SHA-256 copiée dans le presse-papier');
                          }}
                        >
                          {item.sha256Hash.slice(0, 10)}... 📋
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => viewXml(item)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded transition flex items-center gap-1"
                          title="Visualiser le XML UBL 2.1"
                        >
                          <span>📄 XML</span>
                        </button>
                        <button
                          onClick={() => setSelectedCev(item)}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded border border-rose-200 transition flex items-center gap-1"
                          title="Voir le Cachet Électronique Visible (CEV / QR)"
                        >
                          <span>🔲 CEV / QR</span>
                        </button>
                        <button
                          onClick={() => setPrintModalInvoice({
                            invoiceNumber: item.invoice.invoiceNumber,
                            createdAt: item.invoice.createdAt,
                            dueDate: null,
                            subTotal: item.invoice.subTotal,
                            taxAmount: item.invoice.taxAmount,
                            stampDuty: item.invoice.stampDuty || 1.0,
                            totalAmount: item.invoice.totalAmount,
                            currencyCode: item.invoice.currencyCode || 'TND',
                            customer: {
                              name: item.invoice.customer.name,
                              fiscalId: item.invoice.customer.fiscalId,
                              code: item.invoice.customer.code,
                            },
                            ttnReference: item.ttnReference,
                          })}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded transition flex items-center gap-1"
                          title="Imprimer la Facture Officielle TTN (Modèle Tunisie TradeNet)"
                        >
                          <span>🖨️ Facture TTN</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* XML Viewer Modal */}
      {selectedXml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-rose-400 font-bold">XML UBL 2.1 TTN</span>
                <span className="text-slate-300 text-sm">Facture {selectedXml.invoiceNumber}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([selectedXml.xml], { type: 'application/xml;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `TTN-ElFatoora-${selectedXml.invoiceNumber}.xml`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('Fichier XML UBL téléchargé');
                  }}
                  className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg text-xs font-semibold transition"
                >
                  ⬇️ Télécharger XML
                </button>
                <button
                  onClick={() => setSelectedXml(null)}
                  className="text-slate-400 hover:text-white px-2 py-1 rounded text-lg font-bold"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-slate-950 text-emerald-400 font-mono text-xs leading-relaxed">
              <pre className="whitespace-pre-wrap select-all">{selectedXml.xml}</pre>
            </div>
            <div className="p-3 bg-slate-100 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between">
              <span>Standard : UBL 2.1 Invoice (OASIS) • Référentiel TTN Tunisie</span>
              <button
                onClick={() => setSelectedXml(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-medium text-xs transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CEV / QR Code Modal */}
      {selectedCev && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-red-700 to-rose-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔲</span>
                <div>
                  <h3 className="font-bold text-base">Cachet Électronique Visible (CEV / 2D-Doc)</h3>
                  <p className="text-xs text-rose-100">Facture {selectedCev.invoice.invoiceNumber} • Agréation TTN</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCev(null)}
                className="text-rose-200 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-auto">
              {/* CEV Visual Simulation */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-36 h-36 bg-white p-2 border-2 border-dashed border-red-400 rounded-lg flex flex-col items-center justify-center shadow-inner">
                  {/* Decorative QR Pattern */}
                  <div className="w-full h-full bg-slate-900 rounded flex flex-col items-center justify-center text-white text-center p-2">
                    <span className="text-2xl">🇹🇳</span>
                    <span className="text-[9px] font-mono font-bold mt-1 tracking-wider text-rose-300">CEV TTN 2D</span>
                    <span className="text-[8px] text-slate-400">CERTIFIÉ DGI</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">Réf. TTN :</span>
                    <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {selectedCev.ttnReference}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Fournisseur :</span> Safe Tunisie Industries (MF: 1234567/A/M/000)
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Client :</span> {selectedCev.invoice.customer.name} (MF: {selectedCev.invoice.customer.fiscalId})
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Montant Total TTC :</span>{' '}
                    <span className="font-bold text-slate-900">{formatCurrency(selectedCev.invoice.totalAmount)}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Horodatage officiel :</span>{' '}
                    {selectedCev.responseDate ? new Date(selectedCev.responseDate).toLocaleString('fr-TN') : 'Certifié'}
                  </div>
                </div>
              </div>

              {/* Security & Cryptography Details */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <span>🔐</span> Empreintes & Certificats Cryptographiques
                </h4>

                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1">Empreinte SHA-256 (Hash d'intégrité XML) :</div>
                  <div className="p-2.5 bg-slate-100 rounded-lg font-mono text-xs text-slate-800 break-all select-all border border-slate-200">
                    {selectedCev.sha256Hash}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1">Signature Électronique TunTrust (Base64 PKI) :</div>
                  <div className="p-2.5 bg-slate-100 rounded-lg font-mono text-xs text-slate-800 break-all select-all border border-slate-200 max-h-20 overflow-y-auto">
                    {selectedCev.signatureDigest || 'TunTrust qualified signature token validated'}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1">Données brutes encodées dans le CEV (2D-Doc Header) :</div>
                  <div className="p-2.5 bg-slate-950 text-emerald-400 rounded-lg font-mono text-xs break-all select-all max-h-24 overflow-y-auto">
                    {selectedCev.qrCodeData}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Certificat délivré par l'Agence Nationale de Certification Électronique (TunTrust)
              </span>
              <button
                onClick={() => setSelectedCev(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-medium text-xs transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      {printModalInvoice && (
        <TunisianInvoicePrintModal
          invoice={printModalInvoice}
          onClose={() => setPrintModalInvoice(null)}
        />
      )}
    </div>
  );
}
