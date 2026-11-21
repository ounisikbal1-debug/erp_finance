import { Router } from 'express';
import MaterialsService from './service';
const router = Router();

router.get('/materials', async (req, res) => {
  const list = await MaterialsService.list();
  res.json(list);
});

router.post('/materials', async (req, res) => {
  const created = await MaterialsService.create(req.body);
  res.status(201).json(created);
});

export default router;
