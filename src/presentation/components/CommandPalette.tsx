import React, { useState, useEffect } from 'react';

export interface CommandItem {
  id: string;
  title: string;
  category: 'Module' | 'Action' | 'Rapport' | 'Comptabilité' | 'Tiers';
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (viewId: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: CommandItem[] = [
    { id: 'nav-dashboard', title: 'Tableau de bord Général', category: 'Module', shortcut: 'Alt+D', action: () => onNavigate('dashboard') },
    { id: 'nav-compta', title: 'Comptabilité & Grand Livre', category: 'Module', shortcut: 'Alt+G', action: () => onNavigate('general-ledger') },
    { id: 'nav-quick-entry', title: 'Saisie Rapide au Kilomètre (Journal)', category: 'Comptabilité', shortcut: 'F2', action: () => onNavigate('quick-entry') },
    { id: 'nav-treso', title: 'Trésorerie & Synchronisation Bancaire', category: 'Module', shortcut: 'Alt+T', action: () => onNavigate('treasury') },
    { id: 'nav-sales', title: 'Factures Clients & Ventes', category: 'Module', shortcut: 'Alt+V', action: () => onNavigate('sales') },
    { id: 'nav-purchases', title: 'Achats & Factures Fournisseurs (OCR)', category: 'Module', shortcut: 'Alt+A', action: () => onNavigate('purchases') },
    { id: 'nav-stocks', title: 'Gestion des Stocks & PUMP', category: 'Module', shortcut: 'Alt+S', action: () => onNavigate('stocks') },
    { id: 'nav-payroll', title: 'Paie & Déclarations IRPP/CNSS', category: 'Module', shortcut: 'Alt+P', action: () => onNavigate('payroll') },
    { id: 'nav-tax', title: 'Fiscalité & Liasse TTN / G50', category: 'Module', shortcut: 'Alt+F', action: () => onNavigate('taxation') },
    { id: 'nav-migration', title: 'Module de Migration Universelle', category: 'Module', action: () => onNavigate('migration') },
    { id: 'nav-2fa-security', title: 'Sécurité, 2FA & Scellement Probatoire', category: 'Action', action: () => onNavigate('security-2fa') },
    { id: 'action-export-audit', title: 'Exporter le Registre Scellé SHA-256', category: 'Action', action: () => onNavigate('security-2fa') },
    { id: 'action-sync-ebics', title: 'Lancer Synchronisation Bancaire EBICS', category: 'Action', action: () => onNavigate('treasury') },
  ];

  const filtered = commands.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '10vh',
      zIndex: 99999
    }} onClick={onClose}>
      <div style={{
        width: '100%',
        maxWidth: '640px',
        backgroundColor: '#1e293b',
        borderRadius: '12px',
        border: '1px solid #334155',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden'
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '16px',
          borderBottom: '1px solid #334155',
          gap: '12px'
        }}>
          <span style={{ fontSize: '18px', color: '#94a3b8' }}>🔍</span>
          <input
            type="text"
            autoFocus
            placeholder="Tapez une commande, un module ou un compte... (ex: Compta, TTN, OCR, 2FA, F2)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: '16px',
              fontFamily: 'inherit'
            }}
          />
          <kbd style={{
            backgroundColor: '#0f172a',
            color: '#64748b',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            border: '1px solid #334155'
          }}>ESC pour quitter</kbd>
        </div>

        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '8px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
              Aucun résultat pour "{query}"
            </div>
          ) : (
            filtered.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#2563eb' : 'transparent',
                    color: isSelected ? '#ffffff' : '#e2e8f0',
                    transition: 'background-color 0.1s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#334155',
                      color: isSelected ? '#ffffff' : '#94a3b8',
                      fontWeight: 600
                    }}>
                      {item.category}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: isSelected ? 600 : 400 }}>
                      {item.title}
                    </span>
                  </div>
                  {item.shortcut && (
                    <kbd style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: isSelected ? 'rgba(0,0,0,0.25)' : '#0f172a',
                      color: isSelected ? '#ffffff' : '#64748b',
                      border: isSelected ? 'none' : '1px solid #334155'
                    }}>
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{
          padding: '8px 16px',
          backgroundColor: '#0f172a',
          borderTop: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          color: '#64748b',
          fontSize: '11px'
        }}>
          <span>Naviguer: <strong>↑ ↓</strong></span>
          <span>Sélectionner: <strong>Entrée</strong></span>
          <span>Ouvrir à tout moment: <strong>Ctrl + K</strong></span>
        </div>
      </div>
    </div>
  );
};
