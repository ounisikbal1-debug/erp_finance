# Module Finance (FI)

## Description
Gestion de la comptabilité générale, comptes fournisseurs, comptes clients, facturation et trésorerie.

## API (Express)
```ts
import { Router } from 'express';
const router = Router();

// Exemple de route: création d'une facture
router.post('/invoices', (req, res) => {
  // TODO: validation, persistance
  res.status(201).json({ message: 'Facture créée' });
});

export default router;
```

## Service (business logic)
```ts
export class FinanceService {
  // TODO: implémenter les méthodes
  async createInvoice(data: any) {
    // logique métier
    return { id: 'inv_001', ...data };
  }
}
```

## Model (Prisma schema fragment)
```prisma
model Invoice {
  id          String   @id @default(uuid())
  amount      Float
  customerId  String
  createdAt   DateTime @default(now())
}
```
