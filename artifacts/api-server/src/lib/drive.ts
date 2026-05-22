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

async function driveJson<T>(path: string): Promise<T> {
  const res = await connectors.proxy("google-drive", path, { method: "GET" });
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

export async function walkJsonFiles(rootId: string = CALL_DRIVE_FOLDER_ID): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  const stack: Array<{ id: string; path: string }> = [{ id: rootId, path: "" }];
  while (stack.length) {
    const node = stack.pop()!;
    const children = await listChildren(node.id);
    for (const c of children) {
      const childPath = node.path ? `${node.path}/${c.name}` : c.name;
      if (c.mimeType === "application/vnd.google-apps.folder") {
        stack.push({ id: c.id, path: childPath });
      } else if (
        c.mimeType === "application/json" ||
        c.name.toLowerCase().endsWith(".json")
      ) {
        out.push({
          id: c.id,
          name: c.name,
          mimeType: c.mimeType,
          modifiedTime: c.modifiedTime,
          parents: c.parents,
          path: childPath,
        });
      }
    }
  }
  return out;
}

export async function fetchJsonFile(fileId: string): Promise<unknown> {
  const res = await connectors.proxy("google-drive", `/drive/v3/files/${fileId}?alt=media`, {
    method: "GET",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive download ${fileId} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  const text = await res.text();
  return JSON.parse(text);
}
