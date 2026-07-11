import { Router } from "express";
import ledgerService from "../services/ledger.service.js";

const router = Router();

// GET /api/general-ledger?type=&partyType=&partyId=&from=&to=&page=&limit=
router.get("/", async (req, res): Promise<any> => {
  try {
    const type = req.query.type as string | undefined;
    const partyType = req.query.partyType as string | undefined;
    const partyId = req.query.partyId ? parseInt(req.query.partyId as string) : undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await ledgerService.listEntries({ type, partyType, partyId, from, to, page, limit });
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch ledger" });
  }
});

export default router;
