// Defensive parser for unknown call-recording JSON formats.
// Pulls common fields from a variety of upstream tools (CallRail, OpenPhone,
// CallTrackingMetrics, Twilio, custom dumps) so the system is resilient to
// schema drift across Delta Tire's stores.

import type { TranscriptLine } from "@workspace/db";

export interface ParsedCall {
  sourceUid: string;
  storeName: string;
  brand: string | null;
  employeeName: string | null;
  customerPhone: string;
  customerName: string | null;
  direction: "inbound" | "outbound";
  callDatetime: Date;
  durationSeconds: number;
  displayStatus: string;
  hasTranscript: boolean;
  transcript: TranscriptLine[];
  summary: string[];
  rawMeta: Record<string, unknown>;
}

type Json = Record<string, unknown>;

function get(obj: Json, ...keys: string[]): unknown {
  for (const k of keys) {
    const parts = k.split(".");
    let cur: unknown = obj;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as object)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function normalizePhone(raw: string | null): string {
  if (!raw) return "unknown";
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "unknown";
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

function parseDirection(v: unknown): "inbound" | "outbound" {
  const s = (str(v) ?? "").toLowerCase();
  if (s.includes("out") || s === "outgoing" || s === "outbound") return "outbound";
  return "inbound";
}

function parseDuration(v: unknown): number {
  if (typeof v === "number" && isFinite(v)) return Math.max(0, Math.round(v));
  if (typeof v === "string") {
    const colonParts = v.split(":").map((p) => Number(p.trim()));
    if (colonParts.every((n) => Number.isFinite(n)) && colonParts.length >= 2) {
      return colonParts.reduce((acc, n) => acc * 60 + n, 0);
    }
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return 0;
}

function parseDate(v: unknown): Date {
  const s = str(v);
  if (s) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof v === "number") {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function parseTranscript(v: unknown): TranscriptLine[] {
  if (!v) return [];
  if (typeof v === "string") {
    return v
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^([A-Za-z][\w .'-]{0,40}?)\s*[:\-]\s*(.+)$/);
        if (m) return { speaker: m[1]!.trim(), timestamp: "", text: m[2]!.trim() };
        return { speaker: "", timestamp: "", text: line };
      });
  }
  if (Array.isArray(v)) {
    return v
      .map((entry): TranscriptLine | null => {
        if (typeof entry === "string") return { speaker: "", timestamp: "", text: entry };
        if (entry && typeof entry === "object") {
          const e = entry as Json;
          const text = str(get(e, "text", "content", "message", "utterance", "transcript"));
          if (!text) return null;
          const speaker =
            str(get(e, "speaker", "role", "participant", "channel", "side", "from")) ?? "";
          const tsRaw = get(e, "timestamp", "time", "start", "startTime", "start_time", "offset");
          let timestamp = "";
          if (tsRaw != null) {
            if (typeof tsRaw === "number") {
              const s = Math.floor(tsRaw % 60);
              const m = Math.floor((tsRaw / 60) % 60);
              const h = Math.floor(tsRaw / 3600);
              timestamp = h
                ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
                : `${m}:${String(s).padStart(2, "0")}`;
            } else timestamp = String(tsRaw);
          }
          return { speaker, timestamp, text };
        }
        return null;
      })
      .filter((x): x is TranscriptLine => !!x);
  }
  if (typeof v === "object") {
    const obj = v as Json;
    const candidate = obj["lines"] ?? obj["segments"] ?? obj["turns"] ?? obj["entries"];
    if (Array.isArray(candidate)) return parseTranscript(candidate);
  }
  return [];
}

function parseSummary(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string")
    return v
      .split(/\r?\n|•|- /)
      .map((s) => s.trim())
      .filter(Boolean);
  if (Array.isArray(v)) return v.map((x) => str(x) ?? "").filter(Boolean);
  if (typeof v === "object") {
    const obj = v as Json;
    const cand = obj["bullets"] ?? obj["points"] ?? obj["highlights"] ?? obj["text"];
    if (cand) return parseSummary(cand);
  }
  return [];
}

export function parseCallJson(payload: unknown, filePath: string): ParsedCall | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Json;
  // Some recorders nest under a "call" or "data" key
  const obj = (root["call"] && typeof root["call"] === "object" ? (root["call"] as Json) : root);
  const meta = { ...root };

  const direction = parseDirection(get(obj, "direction", "type", "callDirection", "call_direction"));

  // Podium dumps put EITHER a phone (+15059033104) OR a contact name
  // ("Chavez Cliff") in clean_customer_name / customer_name_phone, depending
  // on whether the caller is a known contact. Disambiguate by leading "+".
  const isPhoneLike = (s: string | null) => !!s && /^\+?\d[\d\s().-]{6,}$/.test(s);
  const ccn = str(get(obj, "clean_customer_name"));
  const cnp = str(get(obj, "customer_name_phone"));
  const podiumPhone = [ccn, cnp].find(isPhoneLike) ?? null;
  const podiumName = [ccn, cnp].find((v) => v && !isPhoneLike(v)) ?? null;

  // As a last-ditch effort, recording filenames sometimes embed the phone:
  //   "2026-04-22_+15059033104_bf8d57d3.mp3"
  const audioFile = str(get(obj, "audio_file_mp3", "recording_file", "audio_file"));
  const audioPhone = audioFile?.match(/\+?\d{10,15}/)?.[0] ?? null;

  const customerPhoneRaw =
    podiumPhone ??
    str(
      get(
        obj,
        direction === "inbound" ? "from" : "to",
        direction === "inbound" ? "caller" : "callee",
        "customer.phone",
        "customer_phone",
        "customerPhone",
        "phone",
        direction === "inbound" ? "from_number" : "to_number",
      ),
    ) ??
    str(get(obj, "from", "to", "phone")) ??
    audioPhone;

  const customerName =
    str(
      get(
        obj,
        "customer.name",
        "customerName",
        "caller_name",
        "callerName",
        "contact.name",
        "contactName",
        "customer_full_name",
        "customer_first_name",
      ),
    ) ?? podiumName;

  const storeName =
    str(
      get(
        obj,
        "store",
        "store_name",
        "storeName",
        "location",
        "location_name",
        "locationName",
        "company",
      ),
    ) ?? deriveStoreFromPath(filePath);

  const brand = str(get(obj, "brand", "company_brand"));

  const employeeName = str(
    get(
      obj,
      "employee",
      "employee_name",
      "employeeName",
      "agent",
      "agent_name",
      "agentName",
      "rep",
      "rep_name",
      "user.name",
      "assigned_to",
      "answered_by",
      "answeredBy",
    ),
  );

  const callDatetime = parseDate(
    get(
      obj,
      "call_datetime_iso_utc",
      "datetime",
      "callDatetime",
      "call_datetime",
      "started_at",
      "startedAt",
      "timestamp",
      "date",
      "start_time",
      "startTime",
    ),
  );

  const durationSeconds = parseDuration(
    get(obj, "duration", "duration_seconds", "durationSeconds", "talk_time", "talkTime", "length"),
  );

  const statusRaw =
    (str(get(obj, "display_status", "status", "outcome", "callStatus", "call_status", "disposition")) ?? "").toLowerCase();
  let displayStatus = statusRaw || "answered";
  if (durationSeconds === 0 && direction === "inbound") displayStatus = displayStatus || "missed";
  // Normalize the Podium status vocabulary into just {answered, missed}.
  if (
    statusRaw.includes("miss") ||
    statusRaw === "no-answer" ||
    statusRaw === "no_answer" ||
    statusRaw === "voicemail" ||
    statusRaw === "abandoned" ||
    statusRaw === "prompt_to_text"
  ) {
    displayStatus = "missed";
  } else if (
    (statusRaw.includes("answer") && !statusRaw.includes("no")) ||
    statusRaw === "completed" ||
    statusRaw === "active" ||
    statusRaw === "incoming"
  ) {
    displayStatus = "answered";
  }

  const transcript = parseTranscript(
    get(obj, "transcript_lines", "transcript", "transcription", "transcript_text", "lines"),
  );
  const summary = parseSummary(
    get(obj, "summary", "ai_summary", "aiSummary", "call_summary", "callSummary", "notes"),
  );

  const sourceUid =
    str(get(obj, "call_uid", "id", "call_id", "callId", "uid", "uuid", "external_id", "externalId", "recording_id", "recording_uid")) ??
    filePath;

  return {
    sourceUid,
    storeName: storeName ?? "Unassigned",
    brand,
    employeeName,
    customerPhone: normalizePhone(customerPhoneRaw),
    customerName,
    direction,
    callDatetime,
    durationSeconds,
    displayStatus,
    hasTranscript: transcript.length > 0,
    transcript,
    summary,
    rawMeta: meta,
  };
}

function deriveStoreFromPath(path: string): string | null {
  if (!path) return null;
  const parts = path.split("/");
  if (parts.length >= 2) return parts[0] ?? null;
  return null;
}
