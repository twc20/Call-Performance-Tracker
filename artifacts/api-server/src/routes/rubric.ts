import { Router, type IRouter } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, rubricCriteria } from "@workspace/db";
import { CreateRubricCriterionBody, UpdateRubricCriterionBody } from "@workspace/api-zod";

const router: IRouter = Router();

function shape(r: typeof rubricCriteria.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    weight: Number(r.weight),
    active: r.active,
    appliesTo: r.appliesTo,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/rubric", async (_req, res) => {
  const rows = await db
    .select()
    .from(rubricCriteria)
    .where(isNull(rubricCriteria.deletedAt))
    .orderBy(asc(rubricCriteria.id));
  res.json(rows.map(shape));
});

router.post("/rubric", async (req, res) => {
  const parsed = CreateRubricCriterionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const [row] = await db
    .insert(rubricCriteria)
    .values({
      name: parsed.data.name,
      description: parsed.data.description,
      weight: String(parsed.data.weight ?? 1),
      appliesTo: parsed.data.appliesTo ?? "inbound",
    })
    .returning();
  res.status(201).json(shape(row!));
});

router.patch("/rubric/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateRubricCriterionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch["name"] = parsed.data.name;
  if (parsed.data.description !== undefined) patch["description"] = parsed.data.description;
  if (parsed.data.weight !== undefined) patch["weight"] = String(parsed.data.weight);
  if (parsed.data.active !== undefined) patch["active"] = parsed.data.active;
  if (parsed.data.appliesTo !== undefined) patch["appliesTo"] = parsed.data.appliesTo;

  const [row] = await db
    .update(rubricCriteria)
    .set(patch)
    .where(and(eq(rubricCriteria.id, id), isNull(rubricCriteria.deletedAt)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(shape(row));
});

router.delete("/rubric/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .update(rubricCriteria)
    .set({ deletedAt: new Date(), active: false })
    .where(eq(rubricCriteria.id, id));
  res.status(204).send();
});

export default router;
