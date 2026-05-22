import { db, rubricCriteria } from "@workspace/db";
import { sql } from "drizzle-orm";

const DEFAULTS = [
  {
    name: "Greeting & Identity",
    description:
      "Did the rep open with a clear, branded greeting, identify the store and themselves by name, and project confidence in the first 10 seconds?",
    weight: 1,
    appliesTo: "inbound",
  },
  {
    name: "Discovery (Vehicle & Need)",
    description:
      "Did the rep ask about the customer's vehicle (year/make/model), the specific tire need, mileage, driving conditions, and timeline before pitching anything?",
    weight: 2,
    appliesTo: "all",
  },
  {
    name: "Value Stack (Hormozi)",
    description:
      "Did the rep stack tangible value before price — warranty, installation, road hazard, alignment, lifetime rotation — so price feels like a small slice of total value?",
    weight: 2,
    appliesTo: "inbound",
  },
  {
    name: "Price Anchor & Confidence",
    description:
      "Did the rep give a confident price range without flinching, anchor the higher option first, and avoid apologizing for the cost?",
    weight: 1.5,
    appliesTo: "inbound",
  },
  {
    name: "Objection Handling",
    description:
      "When the customer pushed back on price, timing, or alternatives, did the rep acknowledge, reframe, and offer a path forward instead of conceding?",
    weight: 1.5,
    appliesTo: "all",
  },
  {
    name: "Close — Book the Appointment",
    description:
      "Did the rep explicitly ask for the appointment with a specific time (assumptive close) and confirm the customer's name and phone?",
    weight: 2,
    appliesTo: "inbound",
  },
  {
    name: "Follow-up Commitment",
    description:
      "If the customer didn't book on the call, did the rep set a specific follow-up time and capture their phone to call back?",
    weight: 1.5,
    appliesTo: "all",
  },
  {
    name: "Tone & Professionalism",
    description:
      "Was the rep warm, attentive, free of dead air and filler words, and respectful even under pressure?",
    weight: 1,
    appliesTo: "all",
  },
];

export async function seedDefaultRubric(): Promise<void> {
  const [{ n = 0 } = { n: 0 }] = (
    await db.execute(sql`SELECT COUNT(*)::int AS n FROM rubric_criteria`)
  ).rows as Array<{ n: number }>;
  if (n > 0) return;
  await db.insert(rubricCriteria).values(
    DEFAULTS.map((d) => ({
      name: d.name,
      description: d.description,
      weight: String(d.weight),
      appliesTo: d.appliesTo,
      active: true,
    })),
  );
}
