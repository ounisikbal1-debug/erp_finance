export interface SalesOrderDispatchState {
  id: string;
}

export interface SalesOrderFulfillmentDisplay {
  label: string;
  canDispatch: boolean;
  canReconcile: boolean;
  warning: string | null;
}

export function getSalesOrderFulfillmentDisplay(
  status: string,
  dispatch: SalesOrderDispatchState | null,
): SalesOrderFulfillmentDisplay {
  if (status === 'CANCELLED') {
    return { label: 'Annulée', canDispatch: false, canReconcile: false, warning: null };
  }
  if (dispatch) {
    return { label: 'Expédiée', canDispatch: false, canReconcile: status !== 'DISPATCHED', warning: null };
  }
  if (status === 'DISPATCHED') {
    return {
      label: 'À vérifier',
      canDispatch: false,
      canReconcile: false,
      warning: 'La commande est marquée expédiée, mais aucun dispatch de stock confirmé n’est lié.',
    };
  }
  if (status === 'PICKED') {
    return { label: 'Préparée', canDispatch: true, canReconcile: false, warning: null };
  }
  return { label: 'Ouverte', canDispatch: false, canReconcile: false, warning: null };
}
