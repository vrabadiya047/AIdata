'use server'

import { Workspace, ChatMessage } from "@/types/sovereign";

const BACKEND_URL = "http://127.0.0.1:8000";

/**
 * Fetches the list of workspaces for the logged-in user.
 * This runs entirely on the server.
 */
export async function getWorkspaces(username: string): Promise<Workspace[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/workspaces/${username}`, {
      cache: 'no-store', // Ensures we always see newly created projects
    });

    if (!response.ok) throw new Error("Failed to fetch workspaces");
    
    const data = await response.json();
    return data.workspaces;
  } catch (error) {
    console.error("Sovereign API Error:", error);
    return [];
  }
}

/**
 * Retrieves past messages for a specific project thread.
 */
export async function getThreadHistory(
  project: string, 
  username: string, 
  threadId: string = "General"
): Promise<ChatMessage[]> {
  try {
    const params = new URLSearchParams({ project, username, thread_id: threadId });
    const response = await fetch(`${BACKEND_URL}/api/history?${params.toString()}`);
    
    if (!response.ok) throw new Error("Failed to fetch history");
    
    const data = await response.json();
    return data.history;
  } catch (error) {
    console.error("History Fetch Error:", error);
    return [];
  }
}