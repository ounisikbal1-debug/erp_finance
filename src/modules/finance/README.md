# Module Finance (FI)

## Description
Gestion de la comptabilitÃ© gÃ©nÃ©rale, comptes fournisseurs, comptes clients, facturation et trÃ©sorerie.

## API (Express)
```ts
import { Router } from 'express';
const router = Router();

// Exemple de route: crÃ©ation d'une facture
router.post('/invoices', (req, res) => {
  // TODO: validation, persistance
  res.status(201).json({ message: 'Facture crÃ©Ã©e' });
});

export default router;
```

## Service (business logic)
```ts
export class FinanceService {
  // TODO: implÃ©menter les mÃ©thodes
  async createInvoice(data: any) {
    // logique mÃ©tier
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
