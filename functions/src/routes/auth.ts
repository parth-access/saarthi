import { Router } from 'express';
import { verifyUser, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(verifyUser);

router.get('/me', (req: AuthRequest, res) => {
  res.json({
    success: true,
    data: {
      uid: req.user?.uid,
      email: req.user?.email,
      role: req.user?.role
    }
  });
});

export default router;
