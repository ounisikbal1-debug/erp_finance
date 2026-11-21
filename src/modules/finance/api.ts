import { Router } from 'express';
import FinanceService from './service';
const router = Router();

router.post('/invoices', async (req, res) => {
  const created = await FinanceService.createInvoice(req.body);
  res.status(201).json(created);
});

router.get('/invoices', async (req, res) => {
  const list = await FinanceService.listInvoices();
  res.json(list);
});

export default router;
