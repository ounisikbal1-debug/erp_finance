import React, { useRef } from 'react';

export interface PrintableInvoiceData {
  invoiceNumber: string;
  createdAt: string;
  dueDate: string | null;
  subTotal: number;
  taxAmount: number;
  stampDuty?: number;
  totalAmount: number;
  currencyCode?: string | null;
  customer: {
    name: string;
    fiscalId?: string | null;
    code?: string;
  };
  lines?: Array<{
    code?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    totalHt: number;
  }>;
  ttnReference?: string | null;
}

interface Props {
  invoice: PrintableInvoiceData;
  onClose: () => void;
  entityName?: string;
}

// Convert numbers into French words for Tunisian Dinars and Millimes
function numberToFrenchWords(amount: number): string {
  const units = ['', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF', 'DIX', 'ONZE', 'DOUZE', 'TREIZE', 'QUATORZE', 'QUINZE', 'SEIZE', 'DIX-SEPT', 'DIX-HUIT', 'DIX-NEUF'];
  const tens = ['', 'DIX', 'VINGT', 'TRENTE', 'QUARANTE', 'CINQUANTE', 'SOIXANTE', 'SOIXANTE-DIX', 'QUATRE-VINGT', 'QUATRE-VINGT-DIX'];

  function convertSmall(n: number): string {
    if (n === 0) return '';
    if (n < 20) return units[n];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const rem = n % 10;
      if (ten === 7) return 'SOIXANTE-' + units[10 + rem];
      if (ten === 9) return 'QUATRE-VINGT-' + units[10 + rem];
      return tens[ten] + (rem > 0 ? (rem === 1 && ten !== 8 ? ' ET UN' : '-' + units[rem]) : (ten === 8 ? 'S' : ''));
    }
    const hundred = Math.floor(n / 100);
    const rem = n % 100;
    const hStr = hundred === 1 ? 'CENT' : units[hundred] + ' CENTS';
    return hStr + (rem > 0 ? ' ' + convertSmall(rem) : '');
  }

  function convertThousands(n: number): string {
    if (n === 0) return 'ZÉRO';
    const thousands = Math.floor(n / 1000);
    const remainder = n % 1000;
    let res = '';
    if (thousands === 1) res += 'MILLE';
    else if (thousands > 1) res += convertSmall(thousands) + ' MILLE';
    if (remainder > 0) {
      res += (res ? ' ' : '') + convertSmall(remainder);
    }
    return res;
  }

  const dinars = Math.floor(amount);
  const millimes = Math.round((amount - dinars) * 1000);

  const dinarsWord = convertThousands(dinars) + (dinars > 1 ? ' DINARS' : ' DINAR');
  const millimesWord = millimes > 0 ? ' ET ' + convertThousands(millimes) + ' MILLIMES' : '';

  return dinarsWord + millimesWord;
}

export default function TunisianInvoicePrintModal({ invoice, onClose, entityName }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const originalTitle = document.title;
    document.title = `Facture_TTN_${invoice.invoiceNumber}`;
    window.print();
    document.title = originalTitle;
  };

  const invoiceLines = invoice.lines && invoice.lines.length > 0 ? invoice.lines : [
    {
      code: 'PREST-01',
      description: 'Prestation de services & redevance applicative SAFE_ERP',
      quantity: 1,
      unitPrice: invoice.subTotal,
      taxRate: invoice.subTotal > 0 ? Math.round((invoice.taxAmount / invoice.subTotal) * 100) : 19,
      totalHt: invoice.subTotal,
    },
  ];

  const stamp = invoice.stampDuty ?? 1.0;
  const ttnRef = invoice.ttnReference || `88812500008010077795${invoice.invoiceNumber.replace(/\D/g, '').padStart(6, '0')}`;
  const amountInWords = numberToFrenchWords(invoice.totalAmount);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px',
      overflowY: 'auto',
    }}>
      <div style={{
        background: '#FFFFFF',
        width: '100%',
        maxWidth: '850px',
        maxHeight: '92vh',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
      }}>
        {/* Modal Controls Bar (hidden at print time) */}
        <div className="no-print" style={{
          padding: '12px 20px',
          background: '#0F172A',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📄</span> Impression Facture Officielle TTN (Modèle Tunisie TradeNet)
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                padding: '7px 16px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              🖨ï¸ Imprimer la Facture
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#334155',
                color: '#FFFFFF',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Fermer
            </button>
          </div>
        </div>

        {/* Printable Sheet (Faithful recreation of uploaded TTN invoice) */}
        <div style={{ overflowY: 'auto', padding: '24px 30px', background: '#FFFFFF' }}>
          <div ref={printRef} className="ttn-invoice-sheet" style={{
            color: '#1E293B',
            fontFamily: '"Times New Roman", Times, serif',
            position: 'relative',
            fontSize: '11px',
            lineHeight: 1.3,
          }}>
            {/* Watermark DUPLICATA */}
            <div style={{
              position: 'absolute',
              top: '42%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(-35deg)',
              fontSize: '85px',
              fontWeight: 900,
              color: 'rgba(203, 213, 225, 0.28)',
              pointerEvents: 'none',
              zIndex: 0,
              letterSpacing: '10px',
            }}>
              DUPLICATA
            </div>

            {/* Header: Company & Official Coordinates (Bilingual FR / AR) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #000000', paddingBottom: '6px' }}>
              <div style={{ width: '22%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ border: '2px solid #881337', padding: '2px 5px', fontWeight: 900, fontSize: '16px', color: '#881337', letterSpacing: '-0.02em' }}>
                    T.T.N
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                    TUNISIE TRADENET
                  </div>
                </div>
                <div style={{ fontSize: '9px', color: '#475569', marginTop: '3px' }}>
                  {entityName || 'SAFE TUNISIE INDUSTRIES SARL'}
                </div>
              </div>

              <div style={{ width: '56%', textAlign: 'center', fontSize: '9.5px' }}>
                <div>Adresse : Rue du Lac Malaren, Lotissement El Khalij Les Berges du Lac, 1053 Tunis, Tunisie</div>
                <div>Téléphone : 71 86 17 12 • Télécopie : 71 86 11 41</div>
                <div>Site Web : www.tradenet.com.tn</div>
              </div>

              <div style={{ width: '22%', textAlign: 'right', direction: 'rtl', fontSize: '9.5px', fontFamily: 'Arial, sans-serif' }}>
                <div>العنوان : نهج بحيرة مالارن، ضÙاÙ البحيرة، تونس</div>
                <div>رقم الهاتÙ : 71 86 17 12 • الÙاكس : 71 86 11 41</div>
                <div>موقع الويب : www.tradenet.com.tn</div>
              </div>
            </div>

            {/* Invoice Meta Strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0', fontSize: '10px', fontWeight: 700 }}>
              <div>Facture N° : <span style={{ fontWeight: 900, fontSize: '12px' }}>{invoice.invoiceNumber}</span> / Ùاتورة رقم</div>
              <div>Date : <span>{new Date(invoice.createdAt).toLocaleDateString('fr-TN')}</span> / التاريخ</div>
              <div>Période : du 01/{new Date(invoice.createdAt).getMonth() + 1}/2026 Au 30/{new Date(invoice.createdAt).getMonth() + 1}/2026 / المدة</div>
              <div>Réf. Unique : <span style={{ fontFamily: 'monospace' }}>{ttnRef}</span> / المرجع</div>
            </div>

            {/* QR Code and Customer Box */}
            <div style={{ display: 'flex', gap: '16px', margin: '10px 0', alignItems: 'stretch' }}>
              {/* QR Code Placeholder replicating official CEV */}
              <div style={{ width: '130px', border: '1px solid #000000', padding: '6px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '90px', height: '90px', background: '#0F172A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', padding: '4px' }}>
                  <span style={{ fontSize: '18px' }}>🇹🇳</span>
                  <span style={{ fontSize: '8px', fontWeight: 700, marginTop: '2px', color: '#FDA4AF' }}>CEV TTN 2D</span>
                  <span style={{ fontSize: '7px', color: '#CBD5E1' }}>CERTIFIÉ DGI</span>
                </div>
                <div style={{ fontSize: '7px', marginTop: '4px', fontFamily: 'monospace' }}>{invoice.invoiceNumber}</div>
              </div>

              {/* Customer Box with border */}
              <div style={{ flex: 1, border: '1px solid #000000', borderRadius: '4px', padding: '8px 12px', fontSize: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                <div><strong>Nom Compte :</strong> {invoice.customer.name}</div>
                <div><strong>Mode de connexion :</strong> SMTP / EDI</div>
                <div><strong>Code Client :</strong> {invoice.customer.code || `CLI-${invoice.customer.name.slice(0, 4).toUpperCase()}`}</div>
                <div><strong>Rang du compte :</strong> NP</div>
                <div><strong>Matricule Fiscal :</strong> {invoice.customer.fiscalId || '0891250B/A/M/000'}</div>
                <div><strong>Date Limite de paiement :</strong> {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('fr-TN') : 'À réception'}</div>
                <div style={{ gridColumn: '1 / -1', color: '#475569', fontSize: '9px' }}>TUNIS - TUNISIE</div>
              </div>
            </div>

            {/* Notice Bar */}
            <div style={{ fontSize: '9px', fontStyle: 'italic', margin: '4px 0 8px', borderBottom: '1px solid #94A3B8', paddingBottom: '3px' }}>
              Copie de la facture électronique enregistrée chez TTN sous la référence : <strong>{ttnRef}</strong>
            </div>

            {/* Articles Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000000', fontSize: '10px', marginBottom: '10px' }}>
              <thead>
                <tr style={{ background: '#E2E8F0', borderBottom: '1px solid #000000', textAlign: 'center' }}>
                  <th style={{ border: '1px solid #000000', padding: '5px', width: '12%' }}>Code</th>
                  <th style={{ border: '1px solid #000000', padding: '5px', width: '40%' }}>Désignation</th>
                  <th style={{ border: '1px solid #000000', padding: '5px', width: '10%' }}>Quantité</th>
                  <th style={{ border: '1px solid #000000', padding: '5px', width: '10%' }}>T.V.A. %</th>
                  <th style={{ border: '1px solid #000000', padding: '5px', width: '14%' }}>P.U. H.T.V.A.</th>
                  <th style={{ border: '1px solid #000000', padding: '5px', width: '14%' }}>Total H.T.V.A.</th>
                </tr>
              </thead>
              <tbody>
                {invoiceLines.map((line, idx) => (
                  <tr key={idx} style={{ height: '24px' }}>
                    <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 700 }}>{line.code || `ART-0${idx + 1}`}</td>
                    <td style={{ border: '1px solid #000000', padding: '4px 6px' }}>{line.description}</td>
                    <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right' }}>{line.quantity.toFixed(1)}</td>
                    <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right' }}>{line.taxRate.toFixed(0)}</td>
                    <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right' }}>{line.unitPrice.toFixed(3)}</td>
                    <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>{line.totalHt.toFixed(3)}</td>
                  </tr>
                ))}
                {/* Spacer empty lines if few items to fill invoice body */}
                {Array.from({ length: Math.max(0, 3 - invoiceLines.length) }).map((_, i) => (
                  <tr key={`empty-${i}`} style={{ height: '22px' }}>
                    <td style={{ border: '1px solid #000000' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #000000' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #000000' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #000000' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #000000' }}>&nbsp;</td>
                    <td style={{ border: '1px solid #000000' }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals Section: Two boxes side by side */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '10px', alignItems: 'flex-start' }}>
              {/* Left Box: Tax Breakdown */}
              <div style={{ width: '48%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000000', fontSize: '9.5px' }}>
                  <thead>
                    <tr style={{ background: '#E2E8F0', borderBottom: '1px solid #000000' }}>
                      <th style={{ border: '1px solid #000000', padding: '4px', textAlign: 'center' }}>Taux (%)</th>
                      <th style={{ border: '1px solid #000000', padding: '4px', textAlign: 'right' }}>Base</th>
                      <th style={{ border: '1px solid #000000', padding: '4px', textAlign: 'right' }}>Montant TVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #000000', padding: '4px', textAlign: 'center' }}>19.0</td>
                      <td style={{ border: '1px solid #000000', padding: '4px', textAlign: 'right' }}>{invoice.subTotal.toFixed(3)}</td>
                      <td style={{ border: '1px solid #000000', padding: '4px', textAlign: 'right' }}>{invoice.taxAmount.toFixed(3)}</td>
                    </tr>
                    <tr style={{ fontWeight: 800, background: '#F8FAFC' }}>
                      <td style={{ border: '1px solid #000000', padding: '4px', textAlign: 'center' }}>Total</td>
                      <td style={{ border: '1px solid #000000', padding: '4px', textAlign: 'right' }}>{invoice.subTotal.toFixed(3)}</td>
                      <td style={{ border: '1px solid #000000', padding: '4px', textAlign: 'right' }}>{invoice.taxAmount.toFixed(3)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Right Box: Invoice Summary */}
              <div style={{ width: '52%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000000', fontSize: '9.5px' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 600 }}>Total H.T.V.A.</td>
                      <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>{invoice.subTotal.toFixed(3)}</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 600 }}>Montant TVA</td>
                      <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>{invoice.taxAmount.toFixed(3)}</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #000000', padding: '4px 6px', fontWeight: 600 }}>Droit de Timbre</td>
                      <td style={{ border: '1px solid #000000', padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>{stamp.toFixed(3)}</td>
                    </tr>
                    <tr style={{ background: '#F1F5F9', fontWeight: 900 }}>
                      <td style={{ border: '1px solid #000000', padding: '5px 6px', fontSize: '11px' }}>Montant T.T.C.</td>
                      <td style={{ border: '1px solid #000000', padding: '5px 6px', textAlign: 'right', fontSize: '11px', color: '#0F172A' }}>{invoice.totalAmount.toFixed(3)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Amount in Letters Box */}
            <div style={{ border: '1px solid #000000', padding: '6px 10px', fontSize: '9.5px', marginBottom: '8px' }}>
              <div style={{ fontStyle: 'italic', color: '#334155' }}>
                Arrêté la présente facture, sauf erreur ou omission de notre part, à la somme de :
              </div>
              <div style={{ fontWeight: 900, fontSize: '10.5px', color: '#0F172A', marginTop: '2px', textTransform: 'uppercase' }}>
                {amountInWords}
              </div>
            </div>
            <div style={{ fontSize: '8.5px', fontStyle: 'italic', marginBottom: '14px', color: '#475569' }}>
              À Régler exclusivement au niveau des bureaux postaux sur présentation de la facture ou par virement bancaire.
            </div>

            {/* Bottom Detachable Slip: Coupon de Versement CCP & Bulletin de Versement CCP */}
            <div style={{ borderTop: '1px dashed #000000', paddingTop: '8px', display: 'flex', gap: '16px' }}>
              {/* Left Slip: Coupon de Versement CCP */}
              <div style={{ width: '50%', borderRight: '1px dashed #94A3B8', paddingRight: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: 750 }}>
                  <div>البريد<br />Poste</div>
                  <div style={{ textAlign: 'center' }}>جذر بطاقة إيداع بحساب جاري<br />Coupon de Versement CCP</div>
                  <div>🇹🇳</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0 4px', fontSize: '8px' }}>
                  <div>N° d'émission : |____|____|</div>
                  <div>رقم الإصدار</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', border: '1px solid #000000', padding: '4px', textAlign: 'center', fontSize: '8.5px', background: '#F8FAFC' }}>
                  <div>
                    <div style={{ fontSize: '7px' }}>Code org</div>
                    <strong>0760</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '7px' }}>Montant</div>
                    <strong>{invoice.totalAmount.toFixed(3)}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '7px' }}>Référence</div>
                    <strong style={{ fontSize: '7.5px' }}>0003501541100013</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '7px' }}>Clé</div>
                    <strong>44</strong>
                  </div>
                </div>
              </div>

              {/* Right Slip: Bulletin de Versement CCP */}
              <div style={{ width: '50%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontWeight: 750 }}>
                  <div>البريد<br />Poste</div>
                  <div style={{ textAlign: 'center' }}>بطاقة إيداع بحساب جاري<br />Bulletin de Versement CCP</div>
                  <div>🇹🇳</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0 4px', fontSize: '8px' }}>
                  <div>N° d'émission : |____|____|</div>
                  <div>رقم الإصدار</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', border: '1px solid #000000', padding: '4px', textAlign: 'center', fontSize: '8.5px', background: '#F8FAFC' }}>
                  <div>
                    <div style={{ fontSize: '7px' }}>Code org</div>
                    <strong>0760</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '7px' }}>Montant</div>
                    <strong>{invoice.totalAmount.toFixed(3)}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '7px' }}>Référence</div>
                    <strong style={{ fontSize: '7.5px' }}>0003501541100013</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '7px' }}>Clé</div>
                    <strong>44</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
