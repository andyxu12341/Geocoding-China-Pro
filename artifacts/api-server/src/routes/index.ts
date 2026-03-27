import { Router, type IRouter } from "express";
import healthRouter from "./health";
import geocodeRouter from "./geocode";

const router: IRouter = Router();

router.use(healthRouter);
router.use(geocodeRouter);

export default router;
