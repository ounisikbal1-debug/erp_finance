import { Router } from 'express';
import HRService from './service';
const router = Router();

router.get('/employees', async (req, res) => {
  const list = await HRService.listEmployees();
  res.json(list);
});

router.post('/employees', async (req, res) => {
  const created = await HRService.createEmployee(req.body);
  res.status(201).json(created);
});

export default router;
