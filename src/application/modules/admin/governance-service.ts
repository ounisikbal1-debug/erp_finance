export type SodSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface SodConflictRule {
  ruleCode: string;
  name: string;
  description: string;
  severity: SodSeverity;
  functionA: string;
  functionB: string;
  mitigatingControl?: string;
}

export interface UserPermissionProfile {
  userId: string;
  username: string;
  role: string;
  assignedFunctions: string[];
}

export interface SodViolation {
  ruleCode: string;
  ruleName: string;
  severity: SodSeverity;
  conflictingFunctions: [string, string];
  mitigatingControl?: string;
}

export interface UserSodAuditResult {
  userId: string;
  username: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  violations: SodViolation[];
}

export interface DelegationTier {
  tierName: string;
  maxAmountDt: number; // Montant max autorisé en DT
  requiredRole: string;
}

export const DEFAULT_SOD_RULES: SodConflictRule[] = [
  {
    ruleCode: 'SOD-001',
    name: 'Gestion Fournisseurs vs Paiement Bancaire',
    description: 'Un utilisateur ne peut pas à la fois créer/modifier un RIB fournisseur et autoriser le décaissement bancaire.',
    severity: 'CRITICAL',
    functionA: 'MANAGE_VENDORS',
    functionB: 'AUTHORIZE_PAYMENTS',
    mitigatingControl: 'Double signature bancaire électronique indépendante.',
  },
  {
    ruleCode: 'SOD-002',
    name: 'Création Commande Achat vs Validation Facture Fournisseur',
    description: 'La personne ayant émis le bon de commande ne peut pas approuver le paiement de la facture correspondante.',
    severity: 'HIGH',
    functionA: 'CREATE_PURCHASE_ORDER',
    functionB: 'APPROVE_PURCHASE_INVOICE',
    mitigatingControl: 'Contrôle automatique du 3-Way Matching (BC-BR-Facture) par le système.',
  },
  {
    ruleCode: 'SOD-003',
    name: 'Saisie Comptable vs Clôture de Période',
    description: 'L’opérateur de saisie comptable ne peut pas verrouiller ou clôturer les comptes de la période.',
    severity: 'HIGH',
    functionA: 'POST_JOURNAL_ENTRY',
    functionB: 'LOCK_MONTHLY_PERIOD',
    mitigatingControl: 'Revue et validation par le Directeur Financier avant clôture.',
  },
  {
    ruleCode: 'SOD-004',
    name: 'Gestion Paie vs Exécution des Virements Salaires',
    description: 'Le gestionnaire qui établit les bulletins de paie ne peut pas exécuter le fichier de virement bancaire.',
    severity: 'CRITICAL',
    functionA: 'PROCESS_PAYROLL',
    functionB: 'EXECUTE_PAYROLL_TRANSFER',
    mitigatingControl: 'Approbation préalable par le Responsable RH et le DAF.',
  },
];

export const DEFAULT_DELEGATION_TIERS: DelegationTier[] = [
  { tierName: 'Opérationnel N+1', maxAmountDt: 5000, requiredRole: 'OPERATIONAL_MANAGER' },
  { tierName: 'Direction Financière', maxAmountDt: 50000, requiredRole: 'FINANCIAL_MANAGER' },
  { tierName: 'Direction Générale', maxAmountDt: Infinity, requiredRole: 'ADMIN' },
];

export class GovernanceSodService {
  constructor(
    private readonly rules = DEFAULT_SOD_RULES,
    private readonly tiers = DEFAULT_DELEGATION_TIERS,
  ) {}

  /**
   * Analyse les conflits de séparation des tâches (SoD) pour un utilisateur
   */
  public auditUserSod(user: UserPermissionProfile): UserSodAuditResult {
    const userFuncSet = new Set(user.assignedFunctions);
    const violations: SodViolation[] = [];

    for (const rule of this.rules) {
      if (userFuncSet.has(rule.functionA) && userFuncSet.has(rule.functionB)) {
        violations.push({
          ruleCode: rule.ruleCode,
          ruleName: rule.name,
          severity: rule.severity,
          conflictingFunctions: [rule.functionA, rule.functionB],
          mitigatingControl: rule.mitigatingControl,
        });
      }
    }

    let riskLevel: UserSodAuditResult['riskLevel'] = 'LOW';
    if (violations.some((v) => v.severity === 'CRITICAL')) {
      riskLevel = 'CRITICAL';
    } else if (violations.some((v) => v.severity === 'HIGH')) {
      riskLevel = 'HIGH';
    } else if (violations.length > 0) {
      riskLevel = 'MEDIUM';
    }

    return {
      userId: user.userId,
      username: user.username,
      riskLevel,
      violations,
    };
  }

  /**
   * Vérifie si un utilisateur est habilité à approuver un engagement financier selon les seuils de délégation
   */
  public checkSpendingAuthorization(
    amountDt: number,
    userRole: string,
  ): { authorized: boolean; requiredTier: string; reason?: string } {
    if (amountDt < 0) {
      return { authorized: false, requiredTier: 'NONE', reason: 'Le montant ne peut pas être négatif.' };
    }

    const applicableTier = this.tiers.find((t) => amountDt <= t.maxAmountDt) ?? this.tiers[this.tiers.length - 1];

    // Rôle ADMIN a tous les pouvoirs
    if (userRole === 'ADMIN') {
      return { authorized: true, requiredTier: applicableTier.tierName };
    }

    if (applicableTier.requiredRole === 'OPERATIONAL_MANAGER') {
      const allowedRoles = ['OPERATIONAL_MANAGER', 'FINANCIAL_MANAGER', 'ADMIN'];
      const ok = allowedRoles.includes(userRole);
      return {
        authorized: ok,
        requiredTier: applicableTier.tierName,
        reason: ok ? undefined : `Rôle insuffisant. Requis : ${applicableTier.requiredRole}`,
      };
    }

    if (applicableTier.requiredRole === 'FINANCIAL_MANAGER') {
      const allowedRoles = ['FINANCIAL_MANAGER', 'ADMIN'];
      const ok = allowedRoles.includes(userRole);
      return {
        authorized: ok,
        requiredTier: applicableTier.tierName,
        reason: ok ? undefined : `Dépassement de seuil (> 5 000 DT). Rôle requis : ${applicableTier.requiredRole}`,
      };
    }

    if (applicableTier.requiredRole === 'ADMIN') {
      return {
        authorized: false,
        requiredTier: applicableTier.tierName,
        reason: `Dépassement du seuil de 50 000 DT. Approbation exclusive de la Direction Générale (ADMIN).`,
      };
    }

    return { authorized: false, requiredTier: applicableTier.tierName };
  }
}
