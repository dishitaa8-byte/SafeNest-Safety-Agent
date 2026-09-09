import { Router, type IRouter } from "express";
import healthRouter from "./health";
import safenestRouter from "./safenest";

const router: IRouter = Router();

router.use(healthRouter);
router.use(safenestRouter);

export default router;
