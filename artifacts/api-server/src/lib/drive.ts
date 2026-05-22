import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export const CALL_DRIVE_FOLDER_ID = "1qy0BrUrQl8D-s2zGSUgH7isvlBJ4MjEg";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  parents?: string[];
  path: string;
}

async function driveFetch(path: string): Promise<Response> {
  let attempt = 0;
  const maxAttempts = 6;
  while (true) {
    const res = await connectors.proxy("google-drive", path, { method: "GET" });
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt >= maxAttempts) return res;
    const retryAfter = Number(res.headers.get("retry-after") ?? "1");
    const backoffMs = Math.min(8000, Math.max(retryAfter * 1000, 250 * 2 ** attempt));
    await new Promise((r) => setTimeout(r, backoffMs + Math.random() * 200));
    attempt += 1;
  }
}

async function driveJson<T>(path: string): Promise<T> {
  const res = await driveFetch(path);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive ${path} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

interface DriveListResponse {
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    modifiedTime?: string;
    parents?: string[];
  }>;
  nextPageToken?: string;
}

async function listChildren(folderId: string): Promise<DriveListResponse["files"]> {
  const all: DriveListResponse["files"] = [];
  let pageToken: string | undefined;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent("nextPageToken, files(id,name,mimeType,modifiedTime,parents)");
    const url =
      `/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const page = await driveJson<DriveListResponse>(url);
    all.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return all;
}

// Folders are named like "2026-05" (year-month) or "2026-05-22" (year-month-day).
// Returns the earliest date that could live inside a folder of this name, or null if not a date folder.
function folderDateLowerBound(name: string): Date | null {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(name);
  if (ymd) return new Date(Date.UTC(+ymd[1]!, +ymd[2]! - 1, +ymd[3]!));
  const ym = /^(\d{4})-(\d{2})$/.exec(name);
  if (ym) return new Date(Date.UTC(+ym[1]!, +ym[2]! - 1, 1));
  return null;
}

// Latest possible date inside a folder of this name (end of month for YYYY-MM, same day for YYYY-MM-DD).
function folderDateUpperBound(name: string): Date | null {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(name);
  if (ymd) return new Date(Date.UTC(+ymd[1]!, +ymd[2]! - 1, +ymd[3]!, 23, 59, 59));
  const ym = /^(\d{4})-(\d{2})$/.exec(name);
  if (ym) return new Date(Date.UTC(+ym[1]!, +ym[2]!, 0, 23, 59, 59));
  return null;
}

export interface WalkOptions {
  sinceDate?: Date;
  onProgress?: (msg: string) => void;
}

export async function walkJsonFiles(
  rootId: string = CALL_DRIVE_FOLDER_ID,
  opts: WalkOptions = {},
): Promise<DriveFile[]> {
  const { sinceDate, onProgress } = opts;
  const out: DriveFile[] = [];
  const stack: Array<{ id: string; path: string }> = [{ id: rootId, path: "" }];
  let folders = 0;
  let skippedFolders = 0;
  while (stack.length) {
    const node = stack.pop()!;
    folders += 1;
    const children = await listChildren(node.id);
    let folderJson = 0;
    let folderSkipped = 0;
    for (const c of children) {
      const childPath = node.path ? `${node.path}/${c.name}` : c.name;
      if (c.mimeType === "application/vnd.google-apps.folder") {
        if (sinceDate) {
          const upper = folderDateUpperBound(c.name);
          if (upper && upper < sinceDate) {
            folderSkipped += 1;
            skippedFolders += 1;
            continue;
          }
        }
        stack.push({ id: c.id, path: childPath });
      } else if (c.mimeType === "application/json" || c.name.toLowerCase().endsWith(".json")) {
        if (sinceDate && c.modifiedTime && new Date(c.modifiedTime) < sinceDate) continue;
        out.push({
          id: c.id,
          name: c.name,
          mimeType: c.mimeType,
          modifiedTime: c.modifiedTime,
          parents: c.parents,
          path: childPath,
        });
        folderJson += 1;
      }
    }
    onProgress?.(
      `Walked ${folders} folders (${stack.length} queued, skipped ${skippedFolders}); ${node.path || "/"} → ${folderJson} JSON${folderSkipped ? ` (skipped ${folderSkipped} old)` : ""}; total ${out.length}`,
    );
  }
  return out;
}

// Reference so unused-export check passes for helpers used elsewhere
export { folderDateLowerBound };

export async function fetchJsonFile(fileId: string): Promise<unknown> {
  const res = await driveFetch(`/drive/v3/files/${fileId}?alt=media`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive download ${fileId} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  const text = await res.text();
  return JSON.parse(text);
}
