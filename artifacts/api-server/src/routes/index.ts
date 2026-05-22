import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import storesRouter from "./stores";
import employeesRouter from "./employees";
import callsRouter from "./calls";
import inboxRouter from "./inbox";
import dashboardRouter from "./dashboard";
import rubricRouter from "./rubric";

const router: IRouter = Router();

router.use(healthRouter);
router.use(syncRouter);
router.use(storesRouter);
router.use(employeesRouter);
router.use(callsRouter);
router.use(inboxRouter);
router.use(dashboardRouter);
router.use(rubricRouter);

export default router;
