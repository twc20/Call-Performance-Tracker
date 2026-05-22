import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

function dateFilter(from?: unknown, to?: unknown) {
  const parts = [] as ReturnType<typeof sql.raw>[];
  if (from) parts.push(sql.raw(`AND c.call_date >= '${String(from).replace(/[^0-9-]/g, "")}'`));
  if (to) parts.push(sql.raw(`AND c.call_date <= '${String(to).replace(/[^0-9-]/g, "")}'`));
  return parts;
}

router.get("/dashboard/summary", async (req, res) => {
  const store = req.query["store"] ? String(req.query["store"]) : null;
  const from = req.query["from"] ? String(req.query["from"]) : null;
  const to = req.query["to"] ? String(req.query["to"]) : null;

  const rows = await db.execute(sql`
    WITH filtered AS (
      SELECT c.*, g.overall_score
      FROM calls c
      LEFT JOIN call_grades g ON g.call_id = c.id
      WHERE 1=1
        ${store ? sql`AND c.store_name = ${store}` : sql``}
        ${from ? sql`AND c.call_date >= ${from}` : sql``}
        ${to ? sql`AND c.call_date <= ${to}` : sql``}
    ),
    shoppers AS (
      SELECT f.* FROM filtered f
      WHERE f.direction = 'inbound' AND f.display_status = 'answered' AND f.duration_seconds >= 20
    ),
    shoppers_with_callback AS (
      SELECT DISTINCT s.id FROM shoppers s
      JOIN calls cb ON cb.customer_phone = s.customer_phone
        AND cb.call_date = s.call_date
        AND cb.direction = 'outbound'
        AND cb.call_datetime >= s.call_datetime
    ),
    missed AS (
      SELECT f.* FROM filtered f
      WHERE f.direction = 'inbound' AND (f.display_status = 'missed' OR f.duration_seconds = 0)
    ),
    missed_with_callback AS (
      SELECT DISTINCT m.id FROM missed m
      JOIN calls cb ON cb.customer_phone = m.customer_phone
        AND cb.call_date = m.call_date
        AND cb.direction = 'outbound'
        AND cb.call_datetime >= m.call_datetime
    )
    SELECT
      (SELECT COUNT(*)::int FROM filtered) AS "totalCalls",
      (SELECT COUNT(*)::int FROM filtered WHERE direction='inbound' AND display_status='answered' AND duration_seconds > 0) AS "answeredCalls",
      (SELECT COUNT(*)::int FROM filtered WHERE direction='inbound' AND (display_status='missed' OR duration_seconds = 0)) AS "missedCalls",
      (SELECT COUNT(*)::int FROM filtered WHERE direction='outbound') AS "outboundCalls",
      (SELECT AVG(overall_score)::float FROM filtered WHERE overall_score IS NOT NULL) AS "averageGrade",
      (SELECT COUNT(*)::int FROM filtered WHERE overall_score IS NOT NULL) AS "gradedCalls",
      (SELECT COUNT(*)::int FROM shoppers) AS "shoppers",
      (SELECT COUNT(*)::int FROM shoppers_with_callback) AS "shoppersFollowedUp",
      (SELECT COUNT(*)::int FROM missed) - (SELECT COUNT(*)::int FROM missed_with_callback) AS "missedCallbacks",
      (SELECT AVG(duration_seconds)::float FROM filtered WHERE duration_seconds > 0) AS "averageDurationSeconds"
  `);

  const r = rows.rows[0] as any;
  const shoppers = r?.shoppers ?? 0;
  const followed = r?.shoppersFollowedUp ?? 0;
  const missed = r?.missedCalls ?? 0;
  const missedCb = r?.missedCallbacks ?? 0;
  res.json({
    ...r,
    shoppersFollowedUpPct: shoppers > 0 ? (followed / shoppers) * 100 : 0,
    missedCallbackPct: missed > 0 ? (missedCb / missed) * 100 : 0,
  });
  void dateFilter;
});

router.get("/dashboard/trends", async (req, res) => {
  const days = Math.min(Number(req.query["days"] ?? 30), 180);
  const store = req.query["store"] ? String(req.query["store"]) : null;
  const rows = await db.execute(sql`
    SELECT
      c.call_date AS date,
      COUNT(*)::int AS "totalCalls",
      SUM(CASE WHEN c.direction='inbound' AND c.display_status='answered' AND c.duration_seconds > 0 THEN 1 ELSE 0 END)::int AS "answeredCalls",
      SUM(CASE WHEN c.direction='inbound' AND (c.display_status='missed' OR c.duration_seconds=0) THEN 1 ELSE 0 END)::int AS "missedCalls",
      AVG(g.overall_score)::float AS "averageGrade"
    FROM calls c
    LEFT JOIN call_grades g ON g.call_id = c.id
    WHERE c.call_datetime >= NOW() - (${days} || ' days')::interval
      ${store ? sql`AND c.store_name = ${store}` : sql``}
    GROUP BY c.call_date
    ORDER BY c.call_date ASC
  `);
  res.json(rows.rows);
});

router.get("/dashboard/leaderboard", async (req, res) => {
  const from = req.query["from"] ? String(req.query["from"]) : null;
  const to = req.query["to"] ? String(req.query["to"]) : null;
  const rows = await db.execute(sql`
    SELECT
      c.employee_name AS employee,
      (ARRAY_AGG(DISTINCT c.store_name))[1] AS store,
      COUNT(*)::int AS "totalCalls",
      SUM(CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END)::int AS "gradedCalls",
      AVG(g.overall_score)::float AS "averageGrade"
    FROM calls c
    LEFT JOIN call_grades g ON g.call_id = c.id
    WHERE c.employee_name IS NOT NULL
      ${from ? sql`AND c.call_date >= ${from}` : sql``}
      ${to ? sql`AND c.call_date <= ${to}` : sql``}
    GROUP BY c.employee_name
    HAVING SUM(CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END) > 0
    ORDER BY "averageGrade" DESC NULLS LAST
    LIMIT 25
  `);
  res.json(rows.rows);
});

router.get("/dashboard/store-breakdown", async (req, res) => {
  const from = req.query["from"] ? String(req.query["from"]) : null;
  const to = req.query["to"] ? String(req.query["to"]) : null;
  const rows = await db.execute(sql`
    WITH shoppers AS (
      SELECT c.store_name, c.id, c.customer_phone, c.call_date, c.call_datetime
      FROM calls c
      WHERE c.direction = 'inbound' AND c.display_status='answered' AND c.duration_seconds >= 20
        ${from ? sql`AND c.call_date >= ${from}` : sql``}
        ${to ? sql`AND c.call_date <= ${to}` : sql``}
    ),
    followed AS (
      SELECT DISTINCT s.id, s.store_name FROM shoppers s
      JOIN calls cb ON cb.customer_phone = s.customer_phone AND cb.call_date = s.call_date
        AND cb.direction='outbound' AND cb.call_datetime >= s.call_datetime
    )
    SELECT
      c.store_name AS store,
      MAX(c.brand) AS brand,
      COUNT(*)::int AS "totalCalls",
      SUM(CASE WHEN c.direction='inbound' AND c.display_status='answered' AND c.duration_seconds > 0 THEN 1 ELSE 0 END)::int AS "answeredCalls",
      SUM(CASE WHEN c.direction='inbound' AND (c.display_status='missed' OR c.duration_seconds=0) THEN 1 ELSE 0 END)::int AS "missedCalls",
      AVG(g.overall_score)::float AS "averageGrade",
      CASE WHEN (SELECT COUNT(*) FROM shoppers WHERE store_name = c.store_name) > 0
        THEN (SELECT COUNT(*) FROM followed WHERE store_name = c.store_name)::float
             / (SELECT COUNT(*) FROM shoppers WHERE store_name = c.store_name) * 100
        ELSE 0
      END AS "shoppersFollowedUpPct"
    FROM calls c
    LEFT JOIN call_grades g ON g.call_id = c.id
    WHERE 1=1
      ${from ? sql`AND c.call_date >= ${from}` : sql``}
      ${to ? sql`AND c.call_date <= ${to}` : sql``}
    GROUP BY c.store_name
    ORDER BY "totalCalls" DESC
  `);
  res.json(rows.rows);
});

export default router;
