'use server'

import { cookies } from 'next/headers';
import { Workspace, ChatMessage } from "@/types/sovereign";

const BACKEND_URL = "http://127.0.0.1:8000";

async function authHeader(): Promise<HeadersInit> {
  const store = await cookies();
  const token = store.get('sovereign_session')?.value ?? '';
  return { Cookie: `sovereign_session=${token}` };
}

export async function getWorkspaces(username: string): Promise<Workspace[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/workspaces/${username}`, {
      cache: 'no-store',
      headers: await authHeader(),
    });
    if (!response.ok) throw new Error("Failed to fetch workspaces");
    const data = await response.json();
    return data.workspaces as Workspace[];
  } catch (error) {
    console.error("Sovereign API Error:", error);
    return [];
  }
}

export async function getThreadHistory(
  project: string,
  username: string,
  threadId: string = "General"
): Promise<ChatMessage[]> {
  try {
    const params = new URLSearchParams({ project, username, thread_id: threadId });
    const response = await fetch(`${BACKEND_URL}/api/history?${params.toString()}`, {
      headers: await authHeader(),
    });
    if (!response.ok) throw new Error("Failed to fetch history");
    const data = await response.json();
    return data.history;
  } catch (error) {
    console.error("History Fetch Error:", error);
    return [];
  }
}

export async function getProjectThreads(
  project: string,
  username: string
): Promise<string[]> {
  try {
    const params = new URLSearchParams({ project, username });
    const response = await fetch(`${BACKEND_URL}/api/threads?${params.toString()}`, {
      headers: await authHeader(),
    });
    if (!response.ok) throw new Error("Failed to fetch threads");
    const data = await response.json();
    return data.threads as string[];
  } catch {
    return ["General"];
  }
}
