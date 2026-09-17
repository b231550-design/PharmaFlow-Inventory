import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pharmaflowRouter from "./pharmaflow";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pharmaflowRouter);

export default router;
