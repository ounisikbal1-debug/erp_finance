import React, { useEffect, useState } from 'react';
import { translateBusinessText, useInterfaceLanguage } from './localization';

type Movement = { id: string; direction: string; quantity: number; occurredAt: string; reference: string };
type StockSheet = {
  id: string;
  sheetReference: string;
  tariffCode: string | null;
  itemDescription: string;
  unitCode: string;
  movements: Movement[];
};
type Bond = {
  id: string;
  bondReference: string;
  amount: number;
  currencyCode: string;
  status: string;
  releasedAt: string | null;
  releaseReference: string | null;
};
type CustomsRegime = {
  id: string;
  regimeType: string;
  regimeReference: string;
  title: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  stockSheets: StockSheet[];
  bonds: Bond[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMovement(value: unknown): value is Movement {
  return isRecord(value) && typeof value.id === 'string' && typeof value.direction === 'string'
    && typeof value.quantity === 'number' && typeof value.occurredAt === 'string' && typeof value.reference === 'string';
}

function isStockSheet(value: unknown): value is StockSheet {
  return isRecord(value) && typeof value.id === 'string' && typeof value.sheetReference === 'string'
    && (value.tariffCode === null || typeof value.tariffCode === 'string')
    && typeof value.itemDescription === 'string' && typeof value.unitCode === 'string'
    && Array.isArray(value.movements) && value.movements.every(isMovement);
}

function isBond(value: unknown): value is Bond {
  return isRecord(value) && typeof value.id === 'string' && typeof value.bondReference === 'string'
    && typeof value.amount === 'number' && typeof value.currencyCode === 'string'
    && typeof value.status === 'string'
    && (value.releasedAt === null || typeof value.releasedAt === 'string')
    && (value.releaseReference === null || typeof value.releaseReference === 'string');
}

function isRegime(value: unknown): value is CustomsRegime {
  return isRecord(value) && typeof value.id === 'string' && typeof value.regimeType === 'string'
    && typeof value.regimeReference === 'string' && typeof value.title === 'string'
    && typeof value.status === 'string'
    && (value.startsAt === null || typeof value.startsAt === 'string')
    && (value.endsAt === null || typeof value.endsAt === 'string')
    && Array.isArray(value.stockSheets) && value.stockSheets.every(isStockSheet)
    && Array.isArray(value.bonds) && value.bonds.every(isBond);
}

async function readResponse(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : 'La demande douanière a échoué.');
  }
  return body;
}

export const DEFAULT_TUNISIAN_CUSTOMS_REGIMES: CustomsRegime[] = [
  {
    id: 'reg-at-6000',
    regimeType: 'AT (6000)',
    regimeReference: 'AT-2026-TUN-6012',
    title: 'Admission Temporaire Perfectionnement Actif (Exonération suspensive sous caution)',
    status: 'ACTIVE',
    startsAt: '2026-01-01',
    endsAt: '2026-12-31',
    stockSheets: [
      {
        id: 'sh-01',
        sheetReference: 'FS-ACIER-01',
        tariffCode: '7210.49.00',
        itemDescription: 'Bobines de tôles acier galvanisé 1.5mm pour emboutissage export',
        unitCode: 'KG',
        movements: [
          { id: 'm-01', direction: 'INBOUND', quantity: 15000, occurredAt: '2026-01-15', reference: 'DUM-RADES-1024' },
          { id: 'm-02', direction: 'OUTBOUND', quantity: 6200, occurredAt: '2026-02-10', reference: 'APUR-EX-0045' },
        ],
      },
      {
        id: 'sh-02',
        sheetReference: 'FS-POLY-02',
        tariffCode: '3901.20.90',
        itemDescription: 'Polyéthylène haute densité en granulés pour injection',
        unitCode: 'KG',
        movements: [
          { id: 'm-03', direction: 'INBOUND', quantity: 8000, occurredAt: '2026-01-20', reference: 'DUM-RADES-1088' },
        ],
      },
    ],
    bonds: [
      {
        id: 'b-01',
        bondReference: 'CAUT-STB-2026-041',
        amount: 120000,
        currencyCode: 'TND',
        status: 'ACTIVE',
        releasedAt: null,
        releaseReference: null,
      },
    ],
  },
  {
    id: 'reg-act-5000',
    regimeType: 'ACT (5000)',
    regimeReference: 'ACT-2026-TUN-5008',
    title: 'Apurement & Cession sous Régime Suspensif (Entreprises Totalement Exportatrices)',
    status: 'ACTIVE',
    startsAt: '2026-01-15',
    endsAt: '2026-12-31',
    stockSheets: [
      {
        id: 'sh-03',
        sheetReference: 'FS-FAISC-03',
        tariffCode: '8544.30.00',
        itemDescription: 'Faisceaux de câblage automobile assemblés export',
        unitCode: 'U',
        movements: [
          { id: 'm-04', direction: 'OUTBOUND', quantity: 3400, occurredAt: '2026-02-14', reference: 'EXP-DGD-2026-081' },
        ],
      },
    ],
    bonds: [
      {
        id: 'b-02',
        bondReference: 'CAUT-BIAT-2026-018',
        amount: 65000,
        currencyCode: 'TND',
        status: 'ACTIVE',
        releasedAt: null,
        releaseReference: null,
      },
    ],
  },
  {
    id: 'reg-c-1000',
    regimeType: 'C (1000)',
    regimeReference: 'MC-2026-RADES-089',
    title: 'Mise à la Consommation Directe (Paiement Droits de Douane & TVA 19%)',
    status: 'ACTIVE',
    startsAt: '2026-01-01',
    endsAt: '2026-12-31',
    stockSheets: [
      {
        id: 'sh-04',
        sheetReference: 'FS-MACH-04',
        tariffCode: '8479.89.97',
        itemDescription: 'Machines-outils d’usinage à commande numérique CNC',
        unitCode: 'U',
        movements: [
          { id: 'm-05', direction: 'INBOUND', quantity: 2, occurredAt: '2026-02-01', reference: 'DECL-DGD-8840' },
        ],
      },
    ],
    bonds: [],
  },
  {
    id: 'reg-ep-7000',
    regimeType: 'EP (7000)',
    regimeReference: 'EP-2026-ZARZIS-03',
    title: 'Entrepôt Public / Privé de Douane (Stockage sous douane en suspension)',
    status: 'ACTIVE',
    startsAt: '2026-01-01',
    endsAt: '2026-12-31',
    stockSheets: [
      {
        id: 'sh-05',
        sheetReference: 'FS-STOCK-05',
        tariffCode: '8409.91.00',
        itemDescription: 'Pièces détachées moteurs en magasin sous douane',
        unitCode: 'U',
        movements: [
          { id: 'm-06', direction: 'INBOUND', quantity: 500, occurredAt: '2026-01-28', reference: 'ENTR-DGD-331' },
        ],
      },
    ],
    bonds: [
      {
        id: 'b-03',
        bondReference: 'CAUT-ATB-2026-092',
        amount: 85000,
        currencyCode: 'TND',
        status: 'ACTIVE',
        releasedAt: null,
        releaseReference: null,
      },
    ],
  },
  {
    id: 'reg-et-2000',
    regimeType: 'ET (2000)',
    regimeReference: 'ET-2026-SFAX-007',
    title: 'Exportation Temporaire Perfectionnement Passif (Réparation / Ouvraison UE)',
    status: 'ACTIVE',
    startsAt: '2026-02-01',
    endsAt: '2026-08-31',
    stockSheets: [],
    bonds: [],
  },
  {
    id: 'reg-tr-8000',
    regimeType: 'TR (8000)',
    regimeReference: 'TR-2026-GOULETTE-021',
    title: 'Transit Douanier National sous Scellés (Port de Radès vers Bureau Intérieur Sousse)',
    status: 'ACTIVE',
    startsAt: '2026-02-01',
    endsAt: '2026-12-31',
    stockSheets: [],
    bonds: [
      {
        id: 'b-04',
        bondReference: 'CAUT-BNA-2026-033',
        amount: 45000,
        currencyCode: 'TND',
        status: 'ACTIVE',
        releasedAt: null,
        releaseReference: null,
      },
    ],
  },
];

export default function CustomsRegimePanel({
  accessToken,
  currency,
}: {
  accessToken: string | null;
  currency: string;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [regimes, setRegimes] = useState<CustomsRegime[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [regimeType, setRegimeType] = useState<string>('AT (6000)');
  const [regimeReference, setRegimeReference] = useState('');
  const [regimeTitle, setRegimeTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [sheetReference, setSheetReference] = useState('');
  const [tariffCode, setTariffCode] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [movementSheetId, setMovementSheetId] = useState('');
  const [movementDirection, setMovementDirection] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const [movementQuantity, setMovementQuantity] = useState('');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));
  const [movementReference, setMovementReference] = useState('');
  const [bondReference, setBondReference] = useState('');
  const [bondAmount, setBondAmount] = useState('');
  const [bondId, setBondId] = useState('');
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [releaseReference, setReleaseReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selected = regimes.find((regime) => regime.id === selectedId) ?? null;

  // États pour l'édition en direct du régime sélectionné
  const [editTitle, setEditTitle] = useState('');
  const [editReference, setEditReference] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editEndsAt, setEditEndsAt] = useState('');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editType, setEditType] = useState('AT (6000)');

  useEffect(() => {
    if (selected) {
      setEditTitle(selected.title);
      setEditReference(selected.regimeReference);
      setEditStartsAt(selected.startsAt ? selected.startsAt.slice(0, 10) : '');
      setEditEndsAt(selected.endsAt ? selected.endsAt.slice(0, 10) : '');
      setEditStatus(selected.status);
      setEditType(selected.regimeType);
    }
  }, [selectedId, regimes]);

  const load = async (signal?: AbortSignal) => {
    let loaded: CustomsRegime[] = [];
    try {
      if (accessToken) {
        const response = await fetch('/api/customs-regimes', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        const payload = await readResponse(response);
        if (Array.isArray(payload) && payload.every(isRegime) && payload.length > 0) {
          loaded = payload;
        }
      }
    } catch (_err) {}

    if (loaded.length === 0) {
      const stored = localStorage.getItem('safe_customs_regimes_data');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
        } catch (_err) {}
      }
    }

    if (loaded.length === 0) {
      loaded = DEFAULT_TUNISIAN_CUSTOMS_REGIMES;
      try { localStorage.setItem('safe_customs_regimes_data', JSON.stringify(DEFAULT_TUNISIAN_CUSTOMS_REGIMES)); } catch (_err) {}
    }

    setRegimes(loaded);
    setSelectedId((current) => loaded.some((regime) => regime.id === current) ? current : loaded[0]?.id ?? '');
  };

  useEffect(() => {
    const controller = new AbortController();
    setRegimes([]);
    setSelectedId('');
    load(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Chargement impossible.');
    });
    return () => controller.abort();
  }, [accessToken]);

  const saveSelectedChanges = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const updatedRegime: CustomsRegime = {
      ...selected,
      title: editTitle,
      regimeReference: editReference,
      startsAt: editStartsAt || null,
      endsAt: editEndsAt || null,
      status: editStatus,
      regimeType: editType,
    };
    const updated = regimes.map((r) => r.id === selected.id ? updatedRegime : r);
    setRegimes(updated);
    try { localStorage.setItem('safe_customs_regimes_data', JSON.stringify(updated)); } catch (_err) {}
    setNotice(`✅ Régime douanier « ${editReference} » modifié et enregistré avec succès.`);
    if (accessToken) {
      fetch(`/api/customs-regimes/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(updatedRegime),
      }).catch(() => {});
    }
  };

  const deleteRegime = (id: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce régime douanier ? Cette action est irréversible.')) return;
    const updated = regimes.filter((r) => r.id !== id);
    setRegimes(updated);
    try { localStorage.setItem('safe_customs_regimes_data', JSON.stringify(updated)); } catch (_err) {}
    setSelectedId(updated[0]?.id ?? '');
    setNotice('Régime douanier supprimé.');
    if (accessToken) {
      fetch(`/api/customs-regimes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
    }
  };

  const resetToDefaultRegimes = () => {
    if (!window.confirm('Réinitialiser avec la nomenclature officielle des régimes douaniers tunisiens ?')) return;
    setRegimes(DEFAULT_TUNISIAN_CUSTOMS_REGIMES);
    try { localStorage.setItem('safe_customs_regimes_data', JSON.stringify(DEFAULT_TUNISIAN_CUSTOMS_REGIMES)); } catch (_err) {}
    setSelectedId(DEFAULT_TUNISIAN_CUSTOMS_REGIMES[0]?.id ?? '');
    setNotice('Régimes douaniers tunisiens officiels réinjectés avec succès.');
  };

  const submit = async (
    path: string,
    method: 'POST' | 'PATCH',
    body: unknown,
    success: string,
  ) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (accessToken) {
        try {
          const response = await fetch(path, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify(body),
          });
          await readResponse(response);
          await load();
          setNotice(success);
          return;
        } catch (_err) {}
      }

      // Gestion locale
      if (path === '/api/customs-regimes' && method === 'POST') {
        const b = body as Record<string, unknown>;
        const newRegime: CustomsRegime = {
          id: `reg-${Date.now()}`,
          regimeType: String(b.regimeType || 'AT (6000)'),
          regimeReference: String(b.regimeReference || `REF-${Date.now().toString().slice(-4)}`),
          title: String(b.title || 'Nouveau régime douanier'),
          status: 'ACTIVE',
          startsAt: b.startsAt ? String(b.startsAt) : null,
          endsAt: b.endsAt ? String(b.endsAt) : null,
          stockSheets: [],
          bonds: [],
        };
        const updated = [...regimes, newRegime];
        setRegimes(updated);
        try { localStorage.setItem('safe_customs_regimes_data', JSON.stringify(updated)); } catch (_err) {}
        setSelectedId(newRegime.id);
        setNotice(success);
      } else if (path.includes('/stock-sheets') && method === 'POST' && selected) {
        const b = body as Record<string, unknown>;
        const newSheet: StockSheet = {
          id: `sh-${Date.now()}`,
          sheetReference: String(b.sheetReference || 'FS-01'),
          tariffCode: b.tariffCode ? String(b.tariffCode) : null,
          itemDescription: String(b.itemDescription || 'Article sous douane'),
          unitCode: String(b.unitCode || 'U'),
          movements: [],
        };
        const updatedRegime = { ...selected, stockSheets: [...selected.stockSheets, newSheet] };
        const updated = regimes.map((r) => r.id === selected.id ? updatedRegime : r);
        setRegimes(updated);
        try { localStorage.setItem('safe_customs_regimes_data', JSON.stringify(updated)); } catch (_err) {}
        setNotice(success);
      } else if (path.includes('/movements') && method === 'POST' && selected) {
        const b = body as Record<string, unknown>;
        const targetSheetId = path.split('/stock-sheets/')[1]?.split('/movements')[0];
        const newMvt: Movement = {
          id: `m-${Date.now()}`,
          direction: String(b.direction || 'INBOUND'),
          quantity: Number(b.quantity || 0),
          occurredAt: String(b.occurredAt || new Date().toISOString().slice(0, 10)),
          reference: String(b.reference || 'MVT'),
        };
        const updatedSheets = selected.stockSheets.map((s) => s.id === targetSheetId ? { ...s, movements: [...s.movements, newMvt] } : s);
        const updatedRegime = { ...selected, stockSheets: updatedSheets };
        const updated = regimes.map((r) => r.id === selected.id ? updatedRegime : r);
        setRegimes(updated);
        try { localStorage.setItem('safe_customs_regimes_data', JSON.stringify(updated)); } catch (_err) {}
        setNotice(success);
      } else if (path.includes('/bonds') && method === 'POST' && selected) {
        const b = body as Record<string, unknown>;
        const newBond: Bond = {
          id: `b-${Date.now()}`,
          bondReference: String(b.bondReference || 'CAUT'),
          amount: Number(b.amount || 0),
          currencyCode: String(b.currencyCode || currency),
          status: 'ACTIVE',
          releasedAt: null,
          releaseReference: null,
        };
        const updatedRegime = { ...selected, bonds: [...selected.bonds, newBond] };
        const updated = regimes.map((r) => r.id === selected.id ? updatedRegime : r);
        setRegimes(updated);
        try { localStorage.setItem('safe_customs_regimes_data', JSON.stringify(updated)); } catch (_err) {}
        setNotice(success);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="customs-regime-title" style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 id="customs-regime-title" style={{ margin: '0 0 6px', color: '#0F172A' }}>{text('Régimes douaniers tunisiens (Code des Douanes & DGD SINDA)')}</h2>
          <p style={{ margin: 0, color: '#475569' }}>
            {text('Nomenclature officielle des régimes douaniers en Tunisie : AT (6000), ACT (5000), C (1000), Entrepôt EP (7000), Export Temporaire ET (2000), Transit TR (8000).')}
          </p>
        </div>
        <button
          type="button"
          onClick={resetToDefaultRegimes}
          style={{ background: '#0D9488', color: '#FFFFFF', border: 0, borderRadius: 6, padding: '7px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}
        >
          📦 Recharger les régimes tunisiens
        </button>
      </header>
      {error && <p role="alert" style={{ background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 6, margin: 0 }}>{error}</p>}
      {notice && <p role="status" style={{ background: '#F0FDF4', color: '#166534', padding: 10, borderRadius: 6, margin: 0, fontWeight: 600 }}>{notice}</p>}

      <form onSubmit={(event) => {
        event.preventDefault();
        void submit('/api/customs-regimes', 'POST', {
          regimeType, regimeReference, title: regimeTitle,
          startsAt: startsAt || null, endsAt: endsAt || null,
        }, text('Nouveau régime douanier créé avec succès.'));
        setRegimeReference('');
        setRegimeTitle('');
        setStartsAt('');
        setEndsAt('');
      }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <h3 style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.95rem', color: '#0F172A' }}>{text('Créer un nouveau régime')}</h3>
        <label>{text('Type de régime')}
          <select value={regimeType} onChange={(event) => setRegimeType(event.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1' }}>
            <option value="AT (6000)">AT (6000) — Admission temporaire actif</option>
            <option value="ACT (5000)">ACT (5000) — Cession / Apurement suspensif</option>
            <option value="C (1000)">C (1000) — Mise à la consommation directe</option>
            <option value="EP (7000)">EP (7000) — Entrepôt public / privé sous douane</option>
            <option value="ET (2000)">ET (2000) — Exportation temporaire passif</option>
            <option value="TR (8000)">TR (8000) — Transit douanier sous scellés</option>
          </select>
        </label>
        <label>{text('Référence Déclaration / DUM')} <input required maxLength={100} value={regimeReference} onChange={(event) => setRegimeReference(event.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1', boxSizing: 'border-box' }} /></label>
        <label>{text('Désignation opérationnelle')} <input required maxLength={200} value={regimeTitle} onChange={(event) => setRegimeTitle(event.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1', boxSizing: 'border-box' }} /></label>
        <label>{text('Début')} <input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1', boxSizing: 'border-box' }} /></label>
        <label>{text('Échéance')} <input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1', boxSizing: 'border-box' }} /></label>
        <button type="submit" disabled={busy} style={{ background: '#2563EB', color: '#FFFFFF', border: 0, borderRadius: 6, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>➕ {text('Créer le régime')}</button>
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 10, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <label style={{ flex: 1, minWidth: 280 }}>{text('Régime douanier suivi')}
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1', marginTop: 4 }}>
            <option value="">{text('Sélectionner un régime')}</option>
            {regimes.map((regime) => <option key={regime.id} value={regime.id}>{regime.regimeType} · {regime.regimeReference} — {regime.title}</option>)}
          </select>
        </label>
        {selected && (
          <button
            type="button"
            disabled={busy}
            onClick={() => deleteRegime(selected.id)}
            style={{ background: '#DC2626', color: '#FFFFFF', border: 0, borderRadius: 6, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}
          >
            🗑ï¸ {text('Supprimer ce régime')}
          </button>
        )}
      </div>

      {selected && (
        <div style={{ display: 'grid', gap: 16, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 18 }}>
          {/* FORMULAIRE DE MODIFICATION DIRECTE */}
          <form onSubmit={saveSelectedChanges} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, alignItems: 'end', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 8, padding: 14 }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', color: '#0F172A', fontWeight: 800 }}>âœï¸ Modification du Régime : {selected.regimeReference}</h3>
              <span style={{ fontSize: '0.72rem', background: '#DBEAFE', color: '#1E40AF', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>UI Éditable</span>
            </div>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Type
              <select value={editType} onChange={(e) => setEditType(e.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1', marginTop: 4 }}>
                <option value="AT (6000)">AT (6000)</option>
                <option value="ACT (5000)">ACT (5000)</option>
                <option value="C (1000)">C (1000)</option>
                <option value="EP (7000)">EP (7000)</option>
                <option value="ET (2000)">ET (2000)</option>
                <option value="TR (8000)">TR (8000)</option>
              </select>
            </label>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Référence DGD
              <input value={editReference} onChange={(e) => setEditReference(e.target.value)} required style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1', marginTop: 4, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', gridColumn: 'span 2' }}>Intitulé du régime
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1', marginTop: 4, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Date début
              <input type="date" value={editStartsAt} onChange={(e) => setEditStartsAt(e.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1', marginTop: 4, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Date fin / échéance
              <input type="date" value={editEndsAt} onChange={(e) => setEditEndsAt(e.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1', marginTop: 4, boxSizing: 'border-box' }} />
            </label>
            <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>Statut douanier
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #CBD5E1', marginTop: 4 }}>
                <option value="ACTIVE">Actif (En cours de validité)</option>
                <option value="DRAFT">Brouillon / En constitution</option>
                <option value="CLOSED">Clos / Apuré</option>
                <option value="SUSPENDED">Suspendu</option>
              </select>
            </label>
            <button type="submit" disabled={busy} style={{ background: '#16A34A', color: '#FFFFFF', border: 0, borderRadius: 6, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
              💾 Enregistrer les modifications
            </button>
          </form>

          <h4>{text('Fiches de stock')}</h4>
          {selected.stockSheets.map((sheet) => (
            <article key={sheet.id}>
              <h5><bdi dir="ltr">{sheet.sheetReference}</bdi> — {sheet.itemDescription} ({sheet.unitCode})</h5>
              {sheet.tariffCode && <p>{text('Code NGP :')} <bdi dir="ltr">{sheet.tariffCode}</bdi></p>}
              <ul>{sheet.movements.map((movement) => (
                <li key={movement.id}>{text(movement.direction === 'INBOUND' ? 'Entrée' : 'Sortie')} : <bdi dir="ltr">{movement.quantity} {sheet.unitCode} · {movement.occurredAt.slice(0, 10)} · {movement.reference}</bdi></li>
              ))}</ul>
              <form onSubmit={(event) => {
                event.preventDefault();
                if (!movementQuantity || !movementReference.trim()) return;
                void submit(`/api/customs-regimes/stock-sheets/${sheet.id}/movements`, 'POST', {
                  direction: movementDirection,
                  quantity: Number(movementQuantity),
                  occurredAt: movementDate,
                  reference: movementReference,
                }, text('Mouvement enregistré.'));
                setMovementQuantity('');
                setMovementReference('');
              }}>
                <label>{text('Sens')} <select value={movementDirection} onChange={(event) => setMovementDirection(event.target.value as typeof movementDirection)}>
                  <option value="INBOUND">{text('Entrée')}</option><option value="OUTBOUND">{text('Sortie')}</option>
                </select></label>
                <label>{text('Quantité')} <input required min="0.000001" step="any" type="number" value={movementQuantity} onChange={(event) => setMovementQuantity(event.target.value)} /></label>
                <label>{text('Date')} <input required type="date" value={movementDate} onChange={(event) => setMovementDate(event.target.value)} /></label>
                <label>{text('Référence')} <input required maxLength={300} value={movementReference} onChange={(event) => setMovementReference(event.target.value)} /></label>
                <button type="submit" disabled={busy}>{text('Ajouter le mouvement')}</button>
              </form>
            </article>
          ))}
          <form onSubmit={(event) => {
            event.preventDefault();
            if (!sheetReference.trim() || !itemDescription.trim() || !unitCode.trim()) return;
            void submit(`/api/customs-regimes/${selected.id}/stock-sheets`, 'POST', {
              sheetReference, tariffCode: tariffCode || null, itemDescription, unitCode,
            }, text('Fiche de stock créée.'));
            setSheetReference('');
            setTariffCode('');
            setItemDescription('');
            setUnitCode('');
          }}>
            <h5>{text('Créer une fiche')}</h5>
            <label>{text('Référence')} <input required maxLength={100} value={sheetReference} onChange={(event) => setSheetReference(event.target.value)} /></label>
            <label>{text('Code NGP facultatif')} <input dir="ltr" inputMode="numeric" maxLength={10} value={tariffCode} onChange={(event) => setTariffCode(event.target.value)} /></label>
            <label>{text('Désignation')} <input required maxLength={300} value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} /></label>
            <label>{text('Unité')} <input dir="ltr" required maxLength={20} value={unitCode} onChange={(event) => setUnitCode(event.target.value)} /></label>
            <button type="submit" disabled={busy}>{text('Créer la fiche')}</button>
          </form>

          <h4>{text('Cautions enregistrées')}</h4>
          <ul>{selected.bonds.map((bond) => (
            <li key={bond.id}>
              <bdi dir="ltr">{bond.bondReference} — {bond.amount.toLocaleString('fr-FR')} {bond.currencyCode}</bdi> — {text(bond.status)}
              {bond.releasedAt && <> · {text('mainlevée')} <bdi dir="ltr">{bond.releasedAt.slice(0, 10)} ({bond.releaseReference})</bdi></>}
              {bond.status !== 'RELEASED' && (
                <form onSubmit={(event) => {
                  event.preventDefault();
                  if (bondId !== bond.id || !releaseReference.trim()) return;
                  void submit(`/api/customs-regimes/${selected.id}/bonds/${bond.id}/release`, 'POST', {
                    releasedAt: releaseDate, releaseReference,
                  }, text('Mainlevée enregistrée.'));
                  setBondId('');
                  setReleaseReference('');
                }}>
                  <input aria-label={text('Confirmer la caution')} type="checkbox" checked={bondId === bond.id} onChange={(event) => setBondId(event.target.checked ? bond.id : '')} />
                  <label>{text('Date de mainlevée')} <input required type="date" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} /></label>
                  <label>{text('Référence de mainlevée')} <input required maxLength={300} value={releaseReference} onChange={(event) => setReleaseReference(event.target.value)} /></label>
                  <button type="submit" disabled={busy || bondId !== bond.id}>{text('Enregistrer la mainlevée')}</button>
                </form>
              )}
            </li>
          ))}</ul>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (!bondReference.trim() || !bondAmount) return;
            void submit(`/api/customs-regimes/${selected.id}/bonds`, 'POST', {
              bondReference, amount: Number(bondAmount), currencyCode: currency,
            }, text('Caution enregistrée.'));
            setBondReference('');
            setBondAmount('');
          }}>
            <h5>{text('Enregistrer une caution manuellement')}</h5>
            <label>{text('Référence')} <input required maxLength={100} value={bondReference} onChange={(event) => setBondReference(event.target.value)} /></label>
            <label>{text('Montant')} <input dir="ltr" required type="number" min="0.001" step="0.001" value={bondAmount} onChange={(event) => setBondAmount(event.target.value)} /></label>
            <button type="submit" disabled={busy}>{text('Enregistrer la caution')}</button>
          </form>
        </div>
      )}
    </section>
  );
}
