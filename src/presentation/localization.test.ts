import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { WORKBOOK_FEATURES } from '../application/modules/admin/workbook-features';
import {
  ANNUAL_CLOSE_CHECKS,
  MONTHLY_CLOSE_CHECKS,
} from '../application/modules/monthly-close/checklist';
import {
  tunisianWithholdingRuleCatalog,
  tunisianWithholdingRuleProvenance,
} from '../application/modules/taxation/withholding';
import {
  hasBusinessTranslation,
  getHtmlLanguage,
  isRightToLeft,
  translateCategory,
  translateBusinessText,
  translateInterfaceText,
  translateModuleLabel,
  translateRole,
} from './localization';

describe('interface localization', () => {
  it('sets Arabic language and RTL direction only for Arabic', () => {
    assert.equal(getHtmlLanguage('AR'), 'ar-TN');
    assert.equal(isRightToLeft('AR'), true);
    assert.equal(getHtmlLanguage('FR'), 'fr-TN');
    assert.equal(isRightToLeft('FR'), false);
  });

  it('translates the login, shell, navigation, categories, and roles into Arabic', () => {
    assert.equal(translateInterfaceText('AR', 'signIn'), 'تسجيل الدخول');
    assert.equal(translateInterfaceText('AR', 'entity'), 'الكيان');
    assert.equal(translateModuleLabel('AR', 'customsRegimes', 'fallback'), 'الأنظمة الديوانية للقبول المؤقت');
    assert.equal(translateCategory('AR', 'COMPTABILITÉ'), 'المحاسبة والقيود');
    assert.equal(translateRole('AR', 'ADMIN'), 'مدير النظام');
  });

  it('translates the startup and navigation shell into English', () => {
    assert.equal(translateInterfaceText('EN', 'signIn'), 'Sign in');
    assert.equal(translateInterfaceText('EN', 'languagePreferenceWarning'), 'Your language choice could not be saved on this device.');
    assert.equal(translateModuleLabel('EN', 'dashboard', 'fallback'), 'Dashboard');
    assert.equal(translateCategory('EN', 'COMPTABILITÉ'), 'Accounting & journals');
    assert.equal(translateRole('EN', 'ADMIN'), 'Administrator');
    assert.equal(isRightToLeft('EN'), false);
  });

  it('translates company and consolidated-group context choices', () => {
    assert.equal(translateInterfaceText('FR', 'activeScope'), 'Périmètre actif');
    assert.equal(translateInterfaceText('FR', 'chooseScope'), 'Choisir une société ou un groupe consolidé');
    assert.equal(translateInterfaceText('FR', 'consolidatedGroups'), 'Groupes consolidés');
    assert.equal(translateInterfaceText('FR', 'customerAccountsClerk'), 'Chargé de comptes clients');
    assert.equal(translateInterfaceText('FR', 'supplierAccountsClerk'), 'Chargé de comptes fournisseurs');
    assert.equal(translateInterfaceText('EN', 'companies'), 'Companies');
    assert.equal(translateInterfaceText('EN', 'consolidatedGroups'), 'Consolidated groups');
    assert.equal(translateInterfaceText('EN', 'accountType'), 'Account type');
    assert.equal(translateInterfaceText('AR', 'activeScope'), 'النطاق النشط');
    assert.equal(translateInterfaceText('AR', 'chooseScope'), 'اختر شركة أو مجموعة موحدة');
  });

  it('preserves French labels and falls back for custom modules', () => {
    assert.equal(translateInterfaceText('FR', 'signIn'), 'Se connecter');
    assert.equal(translateModuleLabel('FR', 'dashboard', 'Tableaux de bord'), 'Tableaux de bord');
    assert.equal(translateModuleLabel('AR', 'custom-module', 'Custom module'), 'Custom module');
  });

  it('translates customer-order workflow labels and preserves unknown terms', () => {
    assert.equal(translateBusinessText('AR', 'Nouvelle commande client'), 'طلب عميل جديد');
    assert.equal(translateBusinessText('AR', 'Créer la commande'), 'إنشاء الطلب');
    assert.equal(translateBusinessText('AR', 'Pipeline des devis'), 'مسار عروض الأسعار');
    assert.equal(translateBusinessText('AR', 'Créer une commande fournisseur'), 'إنشاء طلب شراء');
    assert.equal(translateBusinessText('AR', 'Soumettre au contrôle'), 'إرسال للمراجعة');
    assert.equal(translateBusinessText('AR', 'Régimes douaniers AT / ACT'), 'أنظمة القبول المؤقت AT / ACT');
    assert.equal(translateBusinessText('AR', 'Confirmer le rapprochement'), 'تأكيد المطابقة');
    assert.equal(translateBusinessText('AR', 'Tableau de bord financier'), 'لوحة القيادة المالية');
    assert.equal(translateBusinessText('FR', 'Créer la commande'), 'Créer la commande');
    assert.equal(translateBusinessText('AR', 'Valeur inconnue'), 'Valeur inconnue');
  });

  it('translates anomaly-screen labels while retaining French fallback', () => {
    assert.equal(translateBusinessText('AR', 'Anomalies financières'), 'الاختلالات المالية');
    assert.equal(translateBusinessText('AR', 'Contrôles exécutés'), 'الفحوصات المنفذة');
    assert.equal(translateBusinessText('AR', 'Critique'), 'حرج');
    assert.equal(translateBusinessText('AR', 'Aucune anomalie détectée dans les contrôles exécutés'), 'لم يتم اكتشاف اختلالات في الفحوصات المنفذة');
    assert.equal(translateBusinessText('FR', 'Contrôles exécutés'), 'Contrôles exécutés');
  });

  it('covers every literal translated label in the core dashboard and business workflows', () => {
    const files = [
      'DashboardPanel.tsx',
      'CashflowPanel.tsx',
      'AnomaliesPanel.tsx',
      'CustomsRegimePanel.tsx',
      'SalesOrdersPanel.tsx',
      'SalesQuotesPanel.tsx',
      'PurchasesPanel.tsx',
      'OfflineDraftQueuePanel.tsx',
      'SalesInvoicesPanel.tsx',
      'StocksPanel.tsx',
      'ProjectManagementPanel.tsx',
      'CustomsTariffImportPanel.tsx',
      'PublicTendersPanel.tsx',
      'WorkbookReadinessPanel.tsx',
      'CustomerContactsPanel.tsx',
      'EquipmentMaintenancePanel.tsx',
      'AccessPoliciesPanel.tsx',
      'AdminUsersPanel.tsx',
      'TaxationPanel.tsx',
      'TaxDeclarationWorkpaperPanel.tsx',
      'WithholdingPreviewPanel.tsx',
      'WithholdingCertificateWorkflow.tsx',
      'GeneralLedgerPanel.tsx',
      'GeneralBalancePanel.tsx',
      'MonthlyClosePanel.tsx',
      'EmployeesPanel.tsx',
      'LeaveRequestsPanel.tsx',
      'IncomeStatementPanel.tsx',
    ];
    const keys = new Set<string>();
    for (const file of files) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      for (const match of source.matchAll(/text\(['"]([^'"]+)['"]\)/g)) keys.add(match[1]);
    }
    for (const key of [
      'Session API indisponible.',
      'Aucune société authentifiée.',
      'Impossible de charger les clients.',
      'La liste des clients est invalide.',
      'Impossible de charger l’historique.',
      'L’historique des coordonnées est invalide.',
      'Impossible de charger le score client.',
      'Le score client reçu est invalide.',
      'Les coordonnées n’ont pas été enregistrées.',
      'La réponse client est invalide.',
      'Coordonnées enregistrées; les champs modifiés sont consignés dans l’historique.',
      'Impossible de charger les règles d’accès.',
      'Session API indisponible. Reconnectez-vous pour consulter les règles d’accès.',
      'La réponse des règles d’accès est invalide.',
      'Session API indisponible. Reconnectez-vous pour charger les équipements.',
      'Impossible de charger les équipements.',
      'Impossible de charger les interventions.',
      'Impossible de charger les salariés.',
      'La réponse des équipements est invalide.',
      'La réponse des interventions est invalide.',
      'La réponse des salariés est invalide.',
      'Le module maintenance est indisponible.',
      'L’équipement n’a pas pu être enregistré.',
      'La réponse de création de l’équipement est invalide.',
      'Erreur lors de l’enregistrement.',
      'Les données du véhicule n’ont pas pu être enregistrées.',
      'La réponse de mise à jour du véhicule est invalide.',
      'Erreur lors de la mise à jour du véhicule.',
      'L’intervention n’a pas pu être planifiée.',
      'La réponse de création de l’intervention est invalide.',
      'Intervention planifiée.',
      'Erreur lors de la planification.',
      'Le statut de l’intervention n’a pas pu être modifié.',
      'La réponse de mise à jour de l’intervention est invalide.',
      'Statut de l’intervention mis à jour.',
      'Erreur lors de la mise à jour.',
      'enregistré.',
      'mis à jour.',
      'La réponse de gestion des comptes est invalide.',
      'La liste des comptes contient une entrée invalide.',
      'La liste des sociétés contient une entrée invalide.',
      'Le journal des changements de comptes contient une entrée invalide.',
      'La demande d’administration a échoué.',
      'Session API indisponible. Reconnectez-vous pour gérer les comptes.',
      'Impossible de charger les comptes.',
      'La confirmation du mot de passe ne correspond pas.',
      'Compte créé. Le mot de passe a été haché côté serveur; il n’est pas récupérable.',
      'Impossible de créer le compte.',
      'Impossible de mettre à jour le compte.',
      'Session API invalide. Déconnectez-vous puis reconnectez-vous.',
      'Aucune société réelle n’est associée au compte connecté.',
      'Impossible de calculer la déclaration fiscale.',
      'La réponse de déclaration fiscale est invalide.',
      'Impossible de traiter le certificat.',
      'Impossible de lire les certificats.',
      'La réponse des certificats est invalide.',
      'Session API invalide.',
      'Le certificat préparé est invalide.',
      'Impossible de préparer le certificat.',
      'La réponse de changement de statut est invalide.',
      'Impossible de modifier le statut du certificat.',
      'Impossible de traiter le certificat de retenue.',
      'Impossible de charger le grand livre.',
      'La réponse du grand livre est invalide.',
      'Impossible de charger la balance comptable.',
      'La réponse de balance comptable est invalide.',
      'Impossible de charger la checklist de clôture.',
      'Session API indisponible. Reconnectez-vous pour charger la clôture.',
      'Aucune société authentifiée n’est associée à cette session.',
      'La checklist reçue est invalide ou concerne une autre période.',
      'La checklist est indisponible.',
      'Ajoutez une note de validation de 5 à 500 caractères pour conserver une piste d’audit utile.',
      'La confirmation reçue est invalide.',
      'Impossible d’enregistrer la validation.',
      'Ajoutez une note de clôture de 5 à 500 caractères.',
      'La confirmation de clôture reçue est invalide.',
      'Impossible de verrouiller la période.',
      'Contrôle rouvert avec une entrée d’historique.',
      'Contrôle confirmé avec une entrée d’historique.',
      'Clôture annuelle verrouillée après validation.',
      'Période mensuelle verrouillée après validation.',
      'La période doit être au format AAAA-MM ou AAAA.',
      'Le contrôle de clôture demandé est invalide.',
      'Les données de validation sont invalides.',
      'Le statut checked doit être booléen.',
      'Une note de contrôle de 5 à 500 caractères est obligatoire.',
      'Une note de clôture de 5 à 500 caractères est obligatoire.',
      'Société introuvable.',
      'La période est clôturée et ses contrôles ne peuvent plus être modifiés.',
      'Cette période est déjà clôturée.',
      'La période ne peut être clôturée qu’après confirmation de tous les contrôles requis.',
      'Cette période a été clôturée entre-temps.',
      'Session API indisponible. Reconnectez-vous pour charger les salariés.',
      'Impossible de charger les salariés.',
      'La réponse des salariés est invalide.',
      'Le module RH est indisponible.',
      'Renseignez le prénom, le nom, un e-mail valide et un salaire de base positif ou nul.',
      'Le salarié n’a pas pu être enregistré.',
      'La réponse de création du salarié est invalide.',
      'Erreur lors de l’enregistrement du salarié.',
      'Le salarié n’a pas pu être supprimé.',
      'Erreur lors de la suppression du salarié.',
      'Session API indisponible. Reconnectez-vous pour charger les demandes de congé.',
      'Impossible de charger les demandes de congé.',
      'La réponse des demandes de congé est invalide.',
      'Impossible de charger les soldes de congé.',
      'La réponse des soldes de congé est invalide.',
      'Le module congés est indisponible.',
      'Impossible de rafraîchir les soldes de congé.',
      'Sélectionnez un salarié, indiquez les jours, la source de politique, sa date d’effet et justifiez le paramétrage.',
      'Le droit annuel n’a pas pu être enregistré.',
      'Erreur lors du paramétrage du droit annuel.',
      'Sélectionnez un salarié, les dates de congé et renseignez le motif.',
      'La demande de congé n’a pas pu être enregistrée.',
      'La réponse de création de demande est invalide.',
      'Demande approuvée.',
      'Demande refusée.',
      'Un motif est obligatoire pour refuser une demande.',
      'La demande n’a pas pu être examinée.',
      'La réponse de revue est invalide.',
      'Erreur lors de la revue de la demande.',
      'Confirmez que vous vérifierez la réponse avant toute décision.',
      'J’autorise pour cette demande l’envoi au cloud des seuls totaux agrégés, périodes, devise, nombres de lignes et de la question prédéfinie, si le fournisseur est activé.',
      'Les conditions varient selon le fournisseur : les données de l’offre gratuite Gemini peuvent être utilisées pour améliorer ses produits; Groq Llama 3.3 70B est indiqué comme accès Enterprise. Tarifs, quotas et disponibilité ne sont pas garantis.',
      'Une session financière authentifiée est requise.',
      'La réponse de l’assistant financier est invalide.',
      'L’assistant financier est indisponible.',
      'Droit annuel enregistré avec sa justification et son historique.',
      'Le droit est enregistré, mais les soldes n’ont pas pu être actualisés :',
      'Le droit est enregistré, mais les soldes n’ont pas pu être actualisés.',
      'Demande de congé enregistrée et transmise pour examen.',
      'La demande est enregistrée, mais les soldes n’ont pas pu être actualisés :',
      'La demande est enregistrée, mais les soldes n’ont pas pu être actualisés.',
    ]) keys.add(key);

    for (const language of ['EN', 'AR'] as const) {
      const missing = [...keys].filter((key) => !hasBusinessTranslation(language, key));
      for (const feature of WORKBOOK_FEATURES) {
        if (!hasBusinessTranslation(language, feature.label)) missing.push(feature.label);
        if (!hasBusinessTranslation(language, feature.group)) missing.push(feature.group);
      }
      for (const key of ['Matricule fiscal', 'E-mail', 'Téléphone', 'Adresse']) {
        if (!hasBusinessTranslation(language, key)) missing.push(key);
      }
      for (const key of ['Actif', 'Hors service', 'Retiré', 'Planifiée', 'En cours', 'Terminée', 'Annulée']) {
        if (!hasBusinessTranslation(language, key)) missing.push(key);
      }
      for (const key of ['autorisé', 'non autorisé']) {
        if (!hasBusinessTranslation(language, key)) missing.push(key);
      }
      for (const role of ['ADMIN', 'FINANCIAL_MANAGER', 'ACCOUNTANT', 'HR_MANAGER', 'SALES_OFFICER', 'LOGISTICS_MGR']) {
        if (translateRole(language, role) === role) missing.push(`role:${role}`);
      }
      const policyModules: Array<[string, string]> = [
        ['admin', 'Administration et paramètres pays'],
        ['advanced-finance', 'Analyse financière'],
        ['ai', 'Assistant IA'],
        ['anomalies', 'Anomalies financières'],
        ['bi', 'Business intelligence'],
        ['budget', 'Budgets'],
        ['cashflow', 'Trésorerie et cash-flow'],
        ['consolidation', 'Consolidation'],
        ['intercompany', 'Transactions intercompagnies'],
        ['controlling', 'Contrôle de gestion'],
        ['dashboard', 'Tableau de bord'],
        ['finance', 'Comptabilité et grand livre'],
        ['fx-rates', 'Cours de change'],
        ['hr', 'Ressources humaines'],
        ['monthly-close', 'Clôture mensuelle'],
        ['materials', 'Stocks et articles'],
        ['production', 'Production'],
        ['purchases', 'Achats'],
        ['receivables', 'Créances clients'],
        ['sales', 'Ventes'],
        ['taxation', 'Fiscalité'],
      ];
      for (const [moduleId, fallback] of policyModules) {
        const translated = translateModuleLabel(language, moduleId, fallback);
        if (translated === fallback && !(language === 'EN' && (moduleId === 'bi' || moduleId === 'production'))) {
          missing.push(`module:${moduleId}`);
        }
      }
      for (const rule of tunisianWithholdingRuleCatalog) {
        if (!hasBusinessTranslation(language, rule.label)) missing.push(rule.label);
      }
      for (const key of [
        'CALCULATED', 'NOT_APPLICABLE', 'UNAVAILABLE', 'PREPARATION_AVAILABLE',
        'PREPARED', 'ISSUED', 'CANCELLED', 'REVOKED',
        'PURCHASE_INVOICE', 'SUPPLIER_PAYMENT', 'OTHER',
      ]) {
        if (!hasBusinessTranslation(language, key)) missing.push(key);
      }
      for (const key of [
        'Analyse cloud activée — seuls des totaux agrégés et une intention fixe ont été envoyés.',
        'Exécuté localement — aucune donnée envoyée au cloud.',
        'Route de secours utilisée',
      ]) {
        if (!hasBusinessTranslation(language, key)) missing.push(key);
      }
      for (const value of Object.values(tunisianWithholdingRuleProvenance)) {
        if (typeof value === 'string' && !hasBusinessTranslation(language, value)) missing.push(value);
      }
      for (const key of [
        'Congé annuel', 'Congé maladie', 'Congé sans solde', 'Autre',
        'En attente', 'Approuvée', 'Refusée',
      ]) {
        if (!hasBusinessTranslation(language, key)) missing.push(key);
      }
      for (const check of [...MONTHLY_CLOSE_CHECKS, ...ANNUAL_CLOSE_CHECKS]) {
        for (const value of [check.title, check.source]) {
          if (!hasBusinessTranslation(language, value)) missing.push(value);
        }
      }
      for (const key of ['OPEN', 'RESOLVED', 'WITHDRAWN', 'Score de santé financière sur 100']) {
        if (!hasBusinessTranslation(language, key)) missing.push(key);
      }
      assert.deepEqual(missing, [], `${language} is missing: ${missing.join(', ')}`);
    }
  });

});
