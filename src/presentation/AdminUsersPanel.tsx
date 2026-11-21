import React, { useEffect, useState } from 'react';
import { getHtmlLanguage, translateBusinessText, translateRole, useInterfaceLanguage } from './localization';

type UserRole = 'ADMIN' | 'FINANCIAL_MANAGER' | 'ACCOUNTANT' | 'HR_MANAGER' | 'SALES_OFFICER' | 'LOGISTICS_MGR';

interface ManagedUser {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  entityId: string | null;
  createdAt: string;
  entity: { name: string } | null;
}

interface ManagedEntity {
  id: string;
  name: string;
}

interface AdminUserEvent {
  id: string;
  actorUsername: string;
  targetUsername: string;
  action: string;
  previousRole: string | null;
  nextRole: string;
  previousEntityId: string | null;
  nextEntityId: string | null;
  createdAt: string;
}

interface UserDirectory {
  users: ManagedUser[];
  entities: ManagedEntity[];
  events: AdminUserEvent[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrateur',
  FINANCIAL_MANAGER: 'Responsable financier',
  ACCOUNTANT: 'Comptabilité',
  HR_MANAGER: 'Responsable RH',
  SALES_OFFICER: 'Commercial',
  LOGISTICS_MGR: 'Responsable logistique',
};
const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string, error: string): string {
  const field = value[key];
  if (typeof field === 'string') return field;
  throw new Error(error);
}

function nullableString(value: Record<string, unknown>, key: string, error: string): string | null {
  const field = value[key];
  if (field === null) return null;
  if (typeof field === 'string') return field;
  throw new Error(error);
}

function parseDirectory(value: unknown): UserDirectory {
  if (!isRecord(value) || !Array.isArray(value.users) || !Array.isArray(value.entities) || !Array.isArray(value.events)) {
    throw new Error('La réponse de gestion des comptes est invalide.');
  }
  const users = value.users.map((user): ManagedUser => {
    if (!isRecord(user) || typeof user.id !== 'string' || typeof user.username !== 'string'
      || typeof user.role !== 'string' || !ROLES.includes(user.role as UserRole)
      || typeof user.isActive !== 'boolean'
      || !(user.entityId === null || typeof user.entityId === 'string')
      || typeof user.createdAt !== 'string') {
      throw new Error('La liste des comptes contient une entrée invalide.');
    }
    const parsedEntityId = typeof user.entityId === 'string' ? user.entityId : null;
    let parsedEntity: ManagedUser['entity'] = null;
    if (user.entity !== null) {
      if (!isRecord(user.entity) || typeof user.entity.name !== 'string') {
        throw new Error('La liste des comptes contient une entrée invalide.');
      }
      parsedEntity = { name: user.entity.name };
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role as UserRole,
      isActive: user.isActive,
      entityId: parsedEntityId,
      createdAt: user.createdAt,
      entity: parsedEntity,
    };
  });
  const entities = value.entities.map((entity): ManagedEntity => {
    if (!isRecord(entity) || typeof entity.id !== 'string' || typeof entity.name !== 'string') {
      throw new Error('La liste des sociétés contient une entrée invalide.');
    }
    return { id: entity.id, name: entity.name };
  });
  const events = value.events.map((event): AdminUserEvent => {
    const error = 'Le journal des changements de comptes contient une entrée invalide.';
    if (!isRecord(event)) {
      throw new Error('Le journal des changements de comptes contient une entrée invalide.');
    }
    return {
      id: requiredString(event, 'id', error),
      actorUsername: requiredString(event, 'actorUsername', error),
      targetUsername: requiredString(event, 'targetUsername', error),
      action: requiredString(event, 'action', error),
      previousRole: nullableString(event, 'previousRole', error),
      nextRole: requiredString(event, 'nextRole', error),
      previousEntityId: nullableString(event, 'previousEntityId', error),
      nextEntityId: nullableString(event, 'nextEntityId', error),
      createdAt: requiredString(event, 'createdAt', error),
    };
  });
  return { users, entities, events };
}

function getErrorMessage(value: unknown): string {
  return isRecord(value) && typeof value.error === 'string'
    ? value.error
    : 'La demande d’administration a échoué.';
}

export default function AdminUsersPanel({ accessToken, isGroupAdmin = false, scopeEntityId = null }: { accessToken: string | null; isGroupAdmin?: boolean; scopeEntityId?: string | null }) {
  const language = useInterfaceLanguage();
  const text = (value: string) => translateBusinessText(language, value);
  const [directory, setDirectory] = useState<UserDirectory | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { role: UserRole; entityId: string }>>({});
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('ACCOUNTANT');
  const [entityId, setEntityId] = useState(scopeEntityId ?? '');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const loadDirectory = async (signal?: AbortSignal) => {
    if (!accessToken) throw new Error('Session API indisponible. Reconnectez-vous pour gérer les comptes.');
    const response = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(getErrorMessage(payload));
    const nextDirectory = parseDirectory(payload);
    if (!signal?.aborted) {
      setDirectory(nextDirectory);
      setDrafts(Object.fromEntries(nextDirectory.users.map((user) => [user.id, {
        role: user.role,
        entityId: user.entityId ?? '',
      }])));
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setDirectory(null);
    setError('');
    void loadDirectory(controller.signal).catch((requestError: unknown) => {
      if (!controller.signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : 'Impossible de charger les comptes.');
      }
    });
    return () => controller.abort();
  }, [accessToken, refreshVersion]);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (password !== passwordConfirmation) {
      setError('La confirmation du mot de passe ne correspond pas.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role, entityId: isGroupAdmin ? entityId || null : scopeEntityId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload));
      setPassword('');
      setPasswordConfirmation('');
      setUsername('');
      setNotice('Compte créé. Le mot de passe a été haché côté serveur; il n’est pas récupérable.');
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de créer le compte.');
    } finally {
      setBusy(false);
    }
  };

  const updateUser = async (user: ManagedUser) => {
    const draft = drafts[user.id];
    if (!draft) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: draft.role, entityId: isGroupAdmin ? draft.entityId || null : scopeEntityId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload));
      setNotice(`${text('Compte')} ${user.username} ${text('mis à jour.')}`);
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de mettre à jour le compte.');
    } finally {
      setBusy(false);
    }
  };

  const resetUserPassword = async (event: React.FormEvent, user: ManagedUser) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (resetPassword !== resetPasswordConfirmation) {
      setError('La confirmation du mot de passe ne correspond pas.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/password`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload));
      setResettingUserId(null);
      setResetPassword('');
      setResetPasswordConfirmation('');
      setNotice(`${user.username} : ${text('Mot de passe réinitialisé; toutes les sessions du compte ont été invalidées.')}`);
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : text('Impossible de réinitialiser le mot de passe.'));
    } finally {
      setBusy(false);
    }
  };

  const setUserStatus = async (user: ManagedUser) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(payload));
      setNotice(`${user.username} : ${text(user.isActive
        ? 'Compte désactivé; les sessions du processus courant ont été invalidées.'
        : 'Compte réactivé.')}`);
      setRefreshVersion((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : text('Impossible de modifier le statut du compte.'));
    } finally {
      setBusy(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    padding: 16,
  };

  return (
    <section aria-labelledby="admin-users-title" style={{ display: 'grid', gap: 14 }}>
      <header style={cardStyle}>
        <h2 id="admin-users-title" style={{ margin: 0 }}>{text('Comptes utilisateurs et rôles')}</h2>
        <p style={{ color: '#475569', marginBottom: 0 }}>
          {text('Comptes persistés de cette base SAFE. Les rôles déterminent les autorisations réellement appliquées par l’API. Le dernier administrateur actif et votre propre compte ne peuvent pas être désactivés ici.')}
        </p>
      </header>

      {error && <div role="alert" style={{ ...cardStyle, color: '#991B1B', background: '#FEF2F2' }}>{text(error)}</div>}
      {notice && <div role="status" style={{ ...cardStyle, color: '#166534', background: '#F0FDF4' }}>{text(notice)}</div>}
      {!directory && !error && <div role="status" style={cardStyle}>{text('Chargement des comptes…')}</div>}

      {directory && (
        <>
          <form onSubmit={createUser} style={{ ...cardStyle, display: 'grid', gap: 10 }}>
            <h3 style={{ margin: 0 }}>{text('Créer un compte')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4 }}>{text('Identifiant')}
                <input dir="ltr" autoComplete="off" maxLength={100} required value={username} onChange={(event) => setUsername(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>{text('Rôle')}
                <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                  {ROLES.map((item) => <option key={item} value={item}>{translateRole(language, item)}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>{text(isGroupAdmin ? 'Périmètre du compte' : 'Entité du compte')}
                <select value={isGroupAdmin ? entityId : scopeEntityId ?? ''} disabled={!isGroupAdmin} onChange={(event) => setEntityId(event.target.value)}>
                  {isGroupAdmin && <option value="">{role === 'ADMIN' ? text('Administrateur du groupe — toutes les entités') : text('Aucune société associée')}</option>}
                  {directory.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>{text('Mot de passe initial (12 caractères minimum)')}
                <input dir="ltr" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>{text('Confirmer le mot de passe')}
                <input dir="ltr" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} />
              </label>
            </div>
            <div style={{ color: '#64748B', fontSize: 13 }}>
              {text('La création n’affiche ni ne journalise le mot de passe. Un administrateur peut réinitialiser celui d’un autre compte; les sessions du processus courant sont invalidées.')}
            </div>
            <button type="submit" disabled={busy || !accessToken}>{busy ? text('Enregistrement…') : text('Créer le compte')}</button>
          </form>

          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{text('Comptes persistés')} ({directory.users.length})</h3>
            {directory.users.length === 0 ? <p>{text('Aucun compte enregistré.')}</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: language === 'AR' ? 'right' : 'left', fontSize: 13 }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={{ padding: 8 }}>{text('Identifiant')}</th>
                  <th style={{ padding: 8 }}>{text('Rôle')}</th>
                  <th style={{ padding: 8 }}>{text('Société')}</th>
                  <th style={{ padding: 8 }}>{text('Statut')}</th>
                  <th style={{ padding: 8 }}>{text('Créé')}</th>
                  <th style={{ padding: 8 }}>{text('Action')}</th>
                </tr></thead>
                <tbody>{directory.users.map((user) => {
                  const draft = drafts[user.id];
                  return (
                    <tr key={user.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                      <td style={{ padding: 8 }}>{user.username}</td>
                      <td style={{ padding: 8 }}>
                        <select aria-label={`${text('Rôle de')} ${user.username}`} value={draft?.role ?? user.role}
                          onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: { ...current[user.id], role: event.target.value as UserRole } }))}>
                          {ROLES.map((item) => <option key={item} value={item}>{translateRole(language, item)}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: 8 }}>
                        <select aria-label={`${text('Société de')} ${user.username}`} value={isGroupAdmin ? draft?.entityId ?? user.entityId ?? '' : scopeEntityId ?? ''} disabled={!isGroupAdmin}
                          onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: { ...current[user.id], entityId: event.target.value } }))}>
                          {isGroupAdmin && <option value="">{text(user.role === 'ADMIN' ? 'Administrateur du groupe — toutes les entités' : 'Aucune société associée')}</option>}
                          {directory.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: 8 }}>{text(user.isActive ? 'Actif' : 'Inactif')}</td>
                      <td style={{ padding: 8 }}>{new Date(user.createdAt).toLocaleDateString(getHtmlLanguage(language))}</td>
                      <td style={{ padding: 8 }}>
                        <div style={{ display: 'grid', gap: 8, minWidth: 210 }}>
                          <button type="button" disabled={busy || user.role === 'ADMIN' && draft?.role !== 'ADMIN'
                            && directory.users.filter((candidate) => candidate.role === 'ADMIN' && candidate.isActive).length === 1}
                            onClick={() => void updateUser(user)}>
                            {text('Enregistrer')}
                          </button>
                          <button type="button" disabled={busy || !accessToken || (user.isActive
                            && user.role === 'ADMIN'
                            && directory.users.filter((candidate) => candidate.role === 'ADMIN' && candidate.isActive).length <= 1)}
                            onClick={() => void setUserStatus(user)}>
                            {text(user.isActive ? 'Désactiver le compte' : 'Réactiver le compte')}
                          </button>
                          {resettingUserId === user.id ? (
                            <form onSubmit={(event) => void resetUserPassword(event, user)} style={{ display: 'grid', gap: 6 }}>
                              <label style={{ display: 'grid', gap: 4 }}>{text('Nouveau mot de passe (12 caractères minimum)')}
                                <input dir="ltr" type="password" autoComplete="new-password" minLength={12} maxLength={1024}
                                  required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
                              </label>
                              <label style={{ display: 'grid', gap: 4 }}>{text('Confirmer le nouveau mot de passe')}
                                <input dir="ltr" type="password" autoComplete="new-password" minLength={12} maxLength={1024}
                                  required value={resetPasswordConfirmation} onChange={(event) => setResetPasswordConfirmation(event.target.value)} />
                              </label>
                              <button type="submit" disabled={busy || !accessToken}>{text('Confirmer la réinitialisation')}</button>
                              <button type="button" disabled={busy} onClick={() => {
                                setResettingUserId(null);
                                setResetPassword('');
                                setResetPasswordConfirmation('');
                              }}>{text('Annuler')}</button>
                            </form>
                          ) : (
                            <button type="button" disabled={busy || !accessToken} onClick={() => {
                              setResettingUserId(user.id);
                              setResetPassword('');
                              setResetPasswordConfirmation('');
                            }}>{text('Réinitialiser le mot de passe')}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
          </div>
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>{text('Historique des changements (100 derniers)')}</h3>
            {directory.events.length === 0 ? <p>{text('Aucun changement de compte enregistré.')}</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: language === 'AR' ? 'right' : 'left', fontSize: 13 }}>
                <thead><tr style={{ background: '#F8FAFC' }}>
                  <th style={{ padding: 8 }}>{text('Date')}</th>
                  <th style={{ padding: 8 }}>{text('Administrateur')}</th>
                  <th style={{ padding: 8 }}>{text('Compte concerné')}</th>
                  <th style={{ padding: 8 }}>{text('Action')}</th>
                  <th style={{ padding: 8 }}>{text('Rôle précédent → nouveau')}</th>
                  <th style={{ padding: 8 }}>{text('Société précédente → nouvelle')}</th>
                </tr></thead>
                <tbody>{directory.events.map((event) => (
                  <tr key={event.id} style={{ borderTop: '1px solid #E2E8F0' }}>
                    <td style={{ padding: 8 }}>{new Date(event.createdAt).toLocaleString(getHtmlLanguage(language))}</td>
                    <td style={{ padding: 8 }}>{event.actorUsername}</td>
                    <td style={{ padding: 8 }}>{event.targetUsername}</td>
                    <td style={{ padding: 8 }}>{text(event.action === 'USER_CREATED'
                      ? 'Création'
                      : event.action === 'USER_PASSWORD_RESET' ? 'Réinitialisation du mot de passe'
                        : event.action === 'USER_DEACTIVATED' ? 'Désactivation du compte'
                          : event.action === 'USER_ACTIVATED' ? 'Réactivation du compte' : 'Accès modifié')}</td>
                    <td style={{ padding: 8 }}>{event.previousRole ? translateRole(language, event.previousRole) : '—'} → {translateRole(language, event.nextRole)}</td>
                    <td style={{ padding: 8 }}>{event.previousEntityId ?? '—'} → {event.nextEntityId ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}
    </section>
  );
}
