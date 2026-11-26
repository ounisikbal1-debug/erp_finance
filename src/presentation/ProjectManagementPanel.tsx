import React, { useEffect, useMemo, useState } from 'react';
import { getHtmlLanguage, translateBusinessText, useInterfaceLanguage } from './localization';

type CostCategory = 'MATERIAL' | 'LABOR' | 'OVERHEAD' | 'OTHER';

interface ProjectTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
}

interface ProjectMilestone {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  completedAt: string | null;
}

interface ProjectCost {
  id: string;
  category: CostCategory;
  description: string;
  amount: number;
  occurredAt: string;
  sourceReference: string | null;
}

interface Project {
  id: string;
  projectCode: string;
  name: string;
  description: string | null;
  status: string;
  budgetAmount: number | null;
  contractAmount: number | null;
  startAt: string | null;
  endAt: string | null;
  tasks: ProjectTask[];
  milestones: ProjectMilestone[];
  costs: ProjectCost[];
  summary?: {
    recordedCosts: number;
    budgetVariance: number | null;
    contractLessRecordedCosts: number | null;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isProject(value: unknown): value is Project {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.projectCode === 'string'
    && typeof value.name === 'string'
    && (value.description === null || typeof value.description === 'string')
    && typeof value.status === 'string'
    && (value.budgetAmount === null || typeof value.budgetAmount === 'number')
    && (value.contractAmount === null || typeof value.contractAmount === 'number')
    && Array.isArray(value.tasks)
    && Array.isArray(value.milestones)
    && Array.isArray(value.costs)
    && value.tasks.every((task) => isRecord(task) && typeof task.id === 'string' && typeof task.title === 'string')
    && value.milestones.every((milestone) => isRecord(milestone) && typeof milestone.id === 'string' && typeof milestone.title === 'string')
    && value.costs.every((cost) => isRecord(cost) && typeof cost.id === 'string'
      && typeof cost.description === 'string' && typeof cost.amount === 'number');
}

async function readPayload(response: Response): Promise<unknown> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'La demande projet a échoué.');
  }
  return payload;
}

export const DEFAULT_TUNISIAN_PROJECTS: Project[] = [
  {
    id: 'prj-tn-btp-01',
    projectCode: 'PRJ-BTP-2026-01',
    name: 'Chantier Siège Tertiaire R+5 (Berges du Lac 2, Tunis)',
    description: 'Construction gros œuvre béton armé B25, menuiserie aluminium double vitrage, sécurité incendie & VRD selon CCAG tunisien.',
    status: 'ACTIVE',
    budgetAmount: 4800000,
    contractAmount: 5450000,
    startAt: '2025-09-01',
    endAt: '2026-12-31',
    tasks: [
      { id: 'tsk-01', title: 'Terrassement et fondations spéciales (Pieux forés CTC)', description: null, status: 'COMPLETED', dueAt: '2025-11-30', completedAt: '2025-11-28' },
      { id: 'tsk-02', title: 'Gros œuvre poteaux / dalles RDC à R+3', description: null, status: 'IN_PROGRESS', dueAt: '2026-05-15', completedAt: null },
      { id: 'tsk-03', title: 'Lots techniques : Climatisation VRV, plomberie & électricité CFO/CFA', description: null, status: 'PLANNED', dueAt: '2026-09-30', completedAt: null },
    ],
    milestones: [
      { id: 'mls-01', title: 'Obtention Permis de Bâtir & PV Implantation Géomètre', description: null, dueAt: '2025-08-15', completedAt: '2025-08-10' },
      { id: 'mls-02', title: 'Réception Technique Fondations CTC & Coulage Radiers', description: null, dueAt: '2025-11-15', completedAt: '2025-11-12' },
      { id: 'mls-03', title: 'Hors d’Eau / Hors d’Air & Début Second Œuvre', description: null, dueAt: '2026-06-30', completedAt: null },
      { id: 'mls-04', title: 'Réception Provisoire des Travaux & Décompte DGD', description: null, dueAt: '2026-12-15', completedAt: null },
    ],
    costs: [
      { id: 'cst-01', category: 'MATERIAL', description: 'Ciment HRS, fer à béton Fe500 et agrégats carrière Djebel Ressas', amount: 485000, occurredAt: '2025-12-10', sourceReference: 'FAC-FOURN-2025-88' },
      { id: 'cst-02', category: 'LABOR', description: 'Main-d’Å“uvre ferrailleurs, coffreurs et chefs d’équipe chantier', amount: 165000, occurredAt: '2026-01-20', sourceReference: 'PAIE-CHANTIER-01' },
      { id: 'cst-03', category: 'OVERHEAD', description: 'Location grues à tour Potain et centrale à béton mobile', amount: 72000, occurredAt: '2026-02-05', sourceReference: 'LOC-ENGINS-41' },
    ],
  },
  {
    id: 'prj-tn-ind-02',
    projectCode: 'PRJ-IND-2026-02',
    name: 'Extension Unité Agroalimentaire & Froid Industriel (Ben Arous)',
    description: 'Plateforme logistique sous température dirigée (-20°C et +4°C), panneaux sandwichs isolants et dallage quartz haute résistance.',
    status: 'ACTIVE',
    budgetAmount: 2650000,
    contractAmount: 3100000,
    startAt: '2025-11-01',
    endAt: '2026-08-31',
    tasks: [
      { id: 'tsk-11', title: 'Dallage béton armé et traitement de sol anti-poussière', description: null, status: 'COMPLETED', dueAt: '2026-01-31', completedAt: '2026-01-25' },
      { id: 'tsk-12', title: 'Installation compresseurs frigorifiques ammoniac/CO2', description: null, status: 'IN_PROGRESS', dueAt: '2026-04-30', completedAt: null },
    ],
    milestones: [
      { id: 'mls-11', title: 'Validation étude d’impact environnemental ANPE', description: null, dueAt: '2025-10-15', completedAt: '2025-10-10' },
      { id: 'mls-12', title: 'Essais de mise en froid et qualification température', description: null, dueAt: '2026-07-15', completedAt: null },
    ],
    costs: [
      { id: 'cst-11', category: 'MATERIAL', description: 'Panneaux sandwich polyuréthane 120mm et portes isothermes', amount: 320000, occurredAt: '2026-01-15', sourceReference: 'FAC-ISOL-901' },
      { id: 'cst-12', category: 'LABOR', description: 'Équipes frigoristes et monteurs certifiés', amount: 84000, occurredAt: '2026-02-10', sourceReference: 'PAIE-FRIGO-02' },
    ],
  },
  {
    id: 'prj-tn-sol-03',
    projectCode: 'PRJ-ENERG-2026-03',
    name: 'Centrale Solaire Photovoltaïque Raccordée MT 800 kWc (Sousse)',
    description: 'Installation de 1 600 panneaux monocristallins, onduleurs string Huawei et poste de transformation raccordé au réseau STEG.',
    status: 'ACTIVE',
    budgetAmount: 1450000,
    contractAmount: 1780000,
    startAt: '2026-01-15',
    endAt: '2026-06-30',
    tasks: [
      { id: 'tsk-21', title: 'Pose structures porteuses et calepinage toitures', description: null, status: 'IN_PROGRESS', dueAt: '2026-03-31', completedAt: null },
      { id: 'tsk-22', title: 'Tirage câbles solaires DC et raccordement poste MT', description: null, status: 'PLANNED', dueAt: '2026-05-15', completedAt: null },
    ],
    milestones: [
      { id: 'mls-21', title: 'Accord de raccordement technique STEG MT', description: null, dueAt: '2026-01-10', completedAt: '2026-01-08' },
      { id: 'mls-22', title: 'Mise sous tension officielle et injection réseau', description: null, dueAt: '2026-06-15', completedAt: null },
    ],
    costs: [
      { id: 'cst-21', category: 'MATERIAL', description: 'Modules solaires bifaciaux 550Wc et onduleurs 100kW', amount: 590000, occurredAt: '2026-02-01', sourceReference: 'IMPORT-SOLAR-001' },
      { id: 'cst-22', category: 'OTHER', description: 'Frais de dossier homologation STEG et bureau de contrôle', amount: 28000, occurredAt: '2026-02-14', sourceReference: 'STEG-HOMOL-44' },
    ],
  },
  {
    id: 'prj-tn-hydr-04',
    projectCode: 'PRJ-HYDR-2026-04',
    name: 'Réhabilitation Conduite Adduction Eau Potable DN400 (Grand Tunis)',
    description: 'Pose canalisations fonte ductile, raccordements électrovannes et réfection voirie sous cahier des charges SONEDE / ONAS.',
    status: 'PLANNED',
    budgetAmount: 3200000,
    contractAmount: 3650000,
    startAt: '2026-03-01',
    endAt: '2026-11-30',
    tasks: [
      { id: 'tsk-31', title: 'Reconnaissance des réseaux concessionnaires et sondages', description: null, status: 'PLANNED', dueAt: '2026-03-31', completedAt: null },
      { id: 'tsk-32', title: 'Tranchées et pose tuyaux fonte DN400', description: null, status: 'PLANNED', dueAt: '2026-07-31', completedAt: null },
    ],
    milestones: [
      { id: 'mls-31', title: 'Ordre de Service de démarrage officiel (OS)', description: null, dueAt: '2026-03-01', completedAt: null },
      { id: 'mls-32', title: 'Épreuves d’étanchéité sous pression et désinfection', description: null, dueAt: '2026-09-30', completedAt: null },
    ],
    costs: [],
  },
];

export default function ProjectManagementPanel({
  accessToken,
  currency,
}: {
  accessToken: string | null;
  currency: string;
}) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [contractAmount, setContractAmount] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDueAt, setMilestoneDueAt] = useState('');
  const [costCategory, setCostCategory] = useState<CostCategory>('MATERIAL');
  const [costDescription, setCostDescription] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costDate, setCostDate] = useState(new Date().toISOString().slice(0, 10));
  const [costSourceReference, setCostSourceReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;

  const calculateSummary = (p: Project) => {
    const recordedCosts = p.costs.reduce((acc, c) => acc + (c.amount || 0), 0);
    return {
      recordedCosts,
      budgetVariance: p.budgetAmount !== null ? p.budgetAmount - recordedCosts : null,
      contractLessRecordedCosts: p.contractAmount !== null ? p.contractAmount - recordedCosts : null,
    };
  };

  const loadProjects = async (signal?: AbortSignal) => {
    let loaded: Project[] = [];
    try {
      if (accessToken) {
        const response = await fetch('/api/projects', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        const payload = await readPayload(response);
        if (Array.isArray(payload) && payload.every(isProject) && payload.length > 0) {
          loaded = payload;
        }
      }
    } catch (_err) {
      // Ignorer l'erreur réseau / serveur local pour basculer sur les modèles ou le cache
    }

    if (loaded.length === 0) {
      const stored = localStorage.getItem('safe_projects_data');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
        } catch (_err) {}
      }
    }

    if (loaded.length === 0) {
      loaded = DEFAULT_TUNISIAN_PROJECTS;
      try { localStorage.setItem('safe_projects_data', JSON.stringify(DEFAULT_TUNISIAN_PROJECTS)); } catch (_err) {}
    }

    const withSummaries = loaded.map((p) => ({ ...p, summary: calculateSummary(p) }));
    setProjects(withSummaries);
    setSelectedId((current) => withSummaries.some((project) => project.id === current) ? current : withSummaries[0]?.id ?? '');
  };

  useEffect(() => {
    const controller = new AbortController();
    setProjects([]);
    setSelectedId('');
    setLoading(true);
    void loadProjects(controller.signal)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Chargement des projets impossible.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken]);

  const deleteProject = async (id: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce projet ? Cette action est irréversible.')) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (accessToken) {
        await fetch(`/api/projects/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {});
      }
      const updated = projects.filter((p) => p.id !== id);
      setProjects(updated);
      try { localStorage.setItem('safe_projects_data', JSON.stringify(updated)); } catch (_err) {}
      setSelectedId(updated[0]?.id ?? '');
      setNotice('Projet supprimé avec succès.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Erreur lors de la suppression.');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaultProjects = () => {
    if (!window.confirm('Réinitialiser tous les projets avec les modèles de chantiers tunisiens officiels ?')) return;
    const withSummaries = DEFAULT_TUNISIAN_PROJECTS.map((p) => ({ ...p, summary: calculateSummary(p) }));
    setProjects(withSummaries);
    try { localStorage.setItem('safe_projects_data', JSON.stringify(DEFAULT_TUNISIAN_PROJECTS)); } catch (_err) {}
    setSelectedId(withSummaries[0]?.id ?? '');
    setNotice('Modèles de projets tunisiens réinjectés avec succès.');
  };

  const submit = async (
    event: React.FormEvent,
    path: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (accessToken) {
        try {
          const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify(body),
          });
          await readPayload(response);
          await loadProjects();
          setNotice(successMessage);
          return;
        } catch (_apiErr) {
          // Fallback création locale
        }
      }

      // Création / ajout local
      if (path === '/api/projects') {
        const newProj: Project = {
          id: `prj-${Date.now()}`,
          projectCode: String(body.projectCode || `PRJ-${Date.now().toString().slice(-4)}`),
          name: String(body.name || 'Nouveau Chantier'),
          description: body.description ? String(body.description) : null,
          status: 'PLANNED',
          budgetAmount: typeof body.budgetAmount === 'number' ? body.budgetAmount : null,
          contractAmount: typeof body.contractAmount === 'number' ? body.contractAmount : null,
          startAt: body.startAt ? String(body.startAt) : null,
          endAt: body.endAt ? String(body.endAt) : null,
          tasks: [],
          milestones: [],
          costs: [],
        };
        const updated = [...projects, { ...newProj, summary: calculateSummary(newProj) }];
        setProjects(updated);
        try { localStorage.setItem('safe_projects_data', JSON.stringify(updated)); } catch (_err) {}
        setSelectedId(newProj.id);
        setProjectCode('');
        setProjectName('');
        setProjectDescription('');
        setBudgetAmount('');
        setContractAmount('');
        setNotice(successMessage);
      } else if (path.includes('/tasks') && selectedProject) {
        const newTask: ProjectTask = {
          id: `tsk-${Date.now()}`,
          title: String(body.title || 'Tâche'),
          description: null,
          status: 'PLANNED',
          dueAt: body.dueAt ? String(body.dueAt) : null,
          completedAt: null,
        };
        const updatedProj = { ...selectedProject, tasks: [...selectedProject.tasks, newTask] };
        const updated = projects.map((p) => p.id === selectedProject.id ? { ...updatedProj, summary: calculateSummary(updatedProj) } : p);
        setProjects(updated);
        try { localStorage.setItem('safe_projects_data', JSON.stringify(updated)); } catch (_err) {}
        setTaskTitle('');
        setTaskDueAt('');
        setNotice(successMessage);
      } else if (path.includes('/milestones') && selectedProject) {
        const newMls: ProjectMilestone = {
          id: `mls-${Date.now()}`,
          title: String(body.title || 'Jalon'),
          description: null,
          dueAt: body.dueAt ? String(body.dueAt) : null,
          completedAt: null,
        };
        const updatedProj = { ...selectedProject, milestones: [...selectedProject.milestones, newMls] };
        const updated = projects.map((p) => p.id === selectedProject.id ? { ...updatedProj, summary: calculateSummary(updatedProj) } : p);
        setProjects(updated);
        try { localStorage.setItem('safe_projects_data', JSON.stringify(updated)); } catch (_err) {}
        setMilestoneTitle('');
        setMilestoneDueAt('');
        setNotice(successMessage);
      } else if (path.includes('/costs') && selectedProject) {
        const newCost: ProjectCost = {
          id: `cst-${Date.now()}`,
          category: (body.category as CostCategory) || 'OTHER',
          description: String(body.description || 'Coût'),
          amount: Number(body.amount || 0),
          occurredAt: String(body.occurredAt || new Date().toISOString().slice(0, 10)),
          sourceReference: body.sourceReference ? String(body.sourceReference) : null,
        };
        const updatedProj = { ...selectedProject, costs: [...selectedProject.costs, newCost] };
        const updated = projects.map((p) => p.id === selectedProject.id ? { ...updatedProj, summary: calculateSummary(updatedProj) } : p);
        setProjects(updated);
        try { localStorage.setItem('safe_projects_data', JSON.stringify(updated)); } catch (_err) {}
        setCostDescription('');
        setCostAmount('');
        setCostSourceReference('');
        setNotice(successMessage);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Enregistrement projet impossible.');
    } finally {
      setSaving(false);
    }
  };

  const patch = async (path: string, body: Record<string, unknown>, successMessage: string) => {
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (accessToken) {
        try {
          const response = await fetch(path, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify(body),
          });
          await readPayload(response);
          await loadProjects();
          setNotice(successMessage);
          return;
        } catch (_apiErr) {}
      }

      // Modification locale du statut
      if (path.includes('/status') && selectedProject) {
        if (body.status) {
          const newStatus = String(body.status);
          const updatedProj = { ...selectedProject, status: newStatus };
          const updated = projects.map((p) => p.id === selectedProject.id ? { ...updatedProj, summary: calculateSummary(updatedProj) } : p);
          setProjects(updated);
          try { localStorage.setItem('safe_projects_data', JSON.stringify(updated)); } catch (_err) {}
          setNotice(successMessage);
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Mise à jour projet impossible.');
    } finally {
      setSaving(false);
    }
  };

  const formatMoney = (value: number | null | undefined) => value === null || value === undefined
    ? text('Non renseigné')
    : `${value.toLocaleString(getHtmlLanguage(language), { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`;
  const costCategoryLabel = (category: CostCategory) => text({
    MATERIAL: 'Matières',
    LABOR: 'Main-d’Å“uvre',
    OVERHEAD: 'Frais généraux',
    OTHER: 'Autre',
  }[category]);

  const costsByCategory = useMemo(() => {
    const totals = new Map<CostCategory, number>();
    for (const cost of selectedProject?.costs ?? []) {
      totals.set(cost.category, (totals.get(cost.category) ?? 0) + cost.amount);
    }
    return totals;
  }, [selectedProject]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    border: '1px solid #CBD5E1',
    borderRadius: 6,
  };
  const formStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: 10,
    alignItems: 'end',
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: 16,
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: '0 0 6px', color: '#0F172A' }}>{text('Projets & chantiers')}</h2>
          <p style={{ margin: 0, color: '#475569' }}>
            {text('Modèles de chantiers tunisiens (BTP, Industrie, Énergie, Hydraulique). Budgets, jalons, tâches et coûts avec gestion d’ajout et suppression.')}
          </p>
        </div>
        <button
          type="button"
          onClick={resetToDefaultProjects}
          style={{ background: '#0D9488', color: '#FFFFFF', border: 0, borderRadius: 6, padding: '7px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}
        >
          📦 Recharger les modèles tunisiens
        </button>
      </header>
      {error && <div role="alert" style={{ color: '#991B1B', background: '#FEF2F2', padding: 10, borderRadius: 6 }}>{error}</div>}
      {notice && <div role="status" style={{ color: '#166534', background: '#F0FDF4', padding: 10, borderRadius: 6 }}>{text(notice)}</div>}
      <form onSubmit={(event) => void submit(event, '/api/projects', {
        projectCode,
        name: projectName,
        description: projectDescription || null,
        budgetAmount: budgetAmount ? Number(budgetAmount) : null,
        contractAmount: contractAmount ? Number(contractAmount) : null,
        startAt: startAt || null,
        endAt: endAt || null,
      }, 'Projet enregistré.')} style={formStyle}>
        <label>{text('Code projet')}<input required maxLength={30} value={projectCode} onChange={(event) => setProjectCode(event.target.value)} style={inputStyle} /></label>
        <label>{text('Nom')}<input required maxLength={160} value={projectName} onChange={(event) => setProjectName(event.target.value)} style={inputStyle} /></label>
        <label>{text('Description')}<input maxLength={2000} value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} style={inputStyle} /></label>
        <label>{text('Budget')} ({currency})<input type="number" min="0" step="0.001" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} style={inputStyle} /></label>
        <label>{text('Montant contractuel')} ({currency})<input type="number" min="0" step="0.001" value={contractAmount} onChange={(event) => setContractAmount(event.target.value)} style={inputStyle} /></label>
        <label>{text('Début')}<input type="date" value={startAt} onChange={(event) => setStartAt(event.target.value)} style={inputStyle} /></label>
        <label>{text('Fin prévue')}<input type="date" value={endAt} onChange={(event) => setEndAt(event.target.value)} style={inputStyle} /></label>
        <button type="submit" disabled={saving}>{saving ? text('Enregistrement…') : text('➕ Créer un nouveau projet')}</button>
      </form>

      <section style={{ display: 'grid', gap: 12, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 10 }}>
          <label style={{ flex: 1, minWidth: 260 }}>{text('Projet suivi')}
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} style={inputStyle}>
              <option value="">{text('Choisir un projet')}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.name}</option>)}
            </select>
          </label>
          {selectedProject && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void deleteProject(selectedProject.id)}
              style={{ background: '#DC2626', color: '#FFFFFF', border: 0, borderRadius: 6, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}
            >
              🗑️ Supprimer ce projet
            </button>
          )}
        </div>
        {loading && <p role="status">{text('Chargement des projets…')}</p>}
        {!loading && projects.length === 0 && <p>{text('Aucun projet n’est enregistré pour cette entité.')}</p>}
        {selectedProject && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <label>{text('État du projet')}<select
                value={selectedProject.status}
                disabled={saving}
                onChange={(event) => void patch(
                  `/api/projects/${encodeURIComponent(selectedProject.id)}/status`,
                  { status: event.target.value },
                  'Statut du projet mis à jour.',
                )}
                style={inputStyle}
              >
                <option value="PLANNED">{text('Planifié')}</option><option value="ACTIVE">{text('En cours')}</option>
                <option value="ON_HOLD">{text('En pause')}</option><option value="COMPLETED">{text('Terminé')}</option>
                <option value="CANCELLED">{text('Annulé')}</option>
              </select></label>
              <div><strong>{text('Budget')}</strong><div>{formatMoney(selectedProject.budgetAmount)}</div></div>
              <div><strong>{text('Coûts enregistrés')}</strong><div>{formatMoney(selectedProject.summary?.recordedCosts ?? 0)}</div></div>
              <div><strong>{text('Écart budget − coûts saisis')}</strong><div>{formatMoney(selectedProject.summary?.budgetVariance)}</div></div>
              <div><strong>{text('Contrat − coûts saisis')}</strong><div>{formatMoney(selectedProject.summary?.contractLessRecordedCosts)}</div></div>
            </div>
            <small style={{ color: '#64748B' }}>{text('Ces écarts ne comprennent pas les achats ni la main-d’Å“uvre tant qu’ils ne sont pas saisis ici; aucune marge comptable officielle n’est calculée.')}</small>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              <form onSubmit={(event) => void submit(event, `/api/projects/${encodeURIComponent(selectedProject.id)}/tasks`, {
                title: taskTitle,
                dueAt: taskDueAt || null,
              }, 'Tâche ajoutée.')} style={formStyle}>
                <h3 style={{ gridColumn: '1 / -1', margin: 0 }}>{text('Ajouter une tâche')}</h3>
                <label>{text('Titre')}<input required maxLength={160} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} style={inputStyle} /></label>
                <label>{text('Échéance')}<input type="date" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} style={inputStyle} /></label>
                <button type="submit" disabled={saving}>{text('Ajouter')}</button>
              </form>
              <form onSubmit={(event) => void submit(event, `/api/projects/${encodeURIComponent(selectedProject.id)}/milestones`, {
                title: milestoneTitle,
                dueAt: milestoneDueAt || null,
              }, 'Jalon ajouté.')} style={formStyle}>
                <h3 style={{ gridColumn: '1 / -1', margin: 0 }}>{text('Ajouter un jalon')}</h3>
                <label>{text('Titre')}<input required maxLength={160} value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} style={inputStyle} /></label>
                <label>{text('Échéance')}<input type="date" value={milestoneDueAt} onChange={(event) => setMilestoneDueAt(event.target.value)} style={inputStyle} /></label>
                <button type="submit" disabled={saving}>{text('Ajouter')}</button>
              </form>
              <form onSubmit={(event) => void submit(event, `/api/projects/${encodeURIComponent(selectedProject.id)}/costs`, {
                category: costCategory,
                description: costDescription,
                amount: Number(costAmount),
                occurredAt: costDate,
                sourceReference: costSourceReference || null,
              }, 'Coût saisi.')} style={formStyle}>
                <h3 style={{ gridColumn: '1 / -1', margin: 0 }}>{text('Saisir un coût')}</h3>
                <label>{text('Catégorie')}<select value={costCategory} onChange={(event) => setCostCategory(event.target.value as CostCategory)} style={inputStyle}>
                  <option value="MATERIAL">{text('Matières')}</option><option value="LABOR">{text('Main-d’Å“uvre')}</option>
                  <option value="OVERHEAD">{text('Frais généraux')}</option><option value="OTHER">{text('Autre')}</option>
                </select></label>
                <label>{text('Description')}<input required maxLength={300} value={costDescription} onChange={(event) => setCostDescription(event.target.value)} style={inputStyle} /></label>
                <label>{text('Montant')} ({currency})<input required type="number" min="0.001" step="0.001" value={costAmount} onChange={(event) => setCostAmount(event.target.value)} style={inputStyle} /></label>
                <label>{text('Date')}<input required type="date" value={costDate} onChange={(event) => setCostDate(event.target.value)} style={inputStyle} /></label>
                <label>{text('Référence source')}<input maxLength={160} value={costSourceReference} onChange={(event) => setCostSourceReference(event.target.value)} style={inputStyle} /></label>
                <button type="submit" disabled={saving}>{text('Saisir le coût')}</button>
              </form>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <h3>{text('Tâches')} ({selectedProject.tasks.length})</h3>
                {selectedProject.tasks.map((task) => (
                  <p key={task.id}>
                    {task.title}{task.dueAt ? ` — ${task.dueAt.slice(0, 10)}` : ''}
                    <select
                      aria-label={`${text('Statut de la tâche')} ${task.title}`}
                      value={task.status}
                      disabled={saving}
                      onChange={(event) => void patch(
                        `/api/projects/${encodeURIComponent(selectedProject.id)}/tasks/${encodeURIComponent(task.id)}/status`,
                        { status: event.target.value },
                        'Statut de la tâche mis à jour.',
                      )}
                      style={{ ...inputStyle, marginTop: 4 }}
                    >
                      <option value="PLANNED">{text('Planifiée')}</option><option value="IN_PROGRESS">{text('En cours')}</option>
                      <option value="COMPLETED">{text('Terminée')}</option><option value="CANCELLED">{text('Annulée')}</option>
                    </select>
                  </p>
                ))}
              </div>
              <div>
                <h3>{text('Jalons')} ({selectedProject.milestones.length})</h3>
                {selectedProject.milestones.map((milestone) => (
                  <p key={milestone.id}>
                    {milestone.title}{milestone.dueAt ? ` — ${milestone.dueAt.slice(0, 10)}` : ''}
                    {milestone.completedAt
                      ? <strong> — {text('Atteint')}</strong>
                      : <button
                        type="button"
                        disabled={saving}
                        onClick={() => void patch(
                          `/api/projects/${encodeURIComponent(selectedProject.id)}/milestones/${encodeURIComponent(milestone.id)}/complete`,
                          {},
                          'Jalon marqué comme atteint.',
                        )}
                      >{text('Marquer atteint')}</button>}
                  </p>
                ))}
              </div>
              <div>
                <h3>{text('Coûts par catégorie')}</h3>
                {Array.from(costsByCategory, ([category, amount]) => <p key={category}>{costCategoryLabel(category)}: {formatMoney(amount)}</p>)}
              </div>
            </div>
            <h3>{text('Coûts saisis')} ({selectedProject.costs.length})</h3>
            {selectedProject.costs.map((cost) => (
              <div key={cost.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid #E2E8F0', padding: '8px 0' }}>
                <span>{cost.occurredAt.slice(0, 10)} — {costCategoryLabel(cost.category)} — {cost.description}</span>
                <strong>{formatMoney(cost.amount)}</strong>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
