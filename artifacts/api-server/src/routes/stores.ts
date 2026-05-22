import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

router.get("/stores", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT
      c.store_name AS name,
      MAX(c.brand) AS brand,
      COUNT(*)::int AS "totalCalls",
      SUM(CASE WHEN c.direction = 'inbound' THEN 1 ELSE 0 END)::int AS "inboundCalls",
      SUM(CASE WHEN c.display_status = 'missed' OR c.duration_seconds = 0 THEN 1 ELSE 0 END)::int AS "missedCalls",
      AVG(g.overall_score)::float AS "averageGrade"
    FROM calls c
    LEFT JOIN call_grades g ON g.call_id = c.id
    GROUP BY c.store_name
    ORDER BY "totalCalls" DESC
  `);
  res.json(rows.rows);
});

export default router;
