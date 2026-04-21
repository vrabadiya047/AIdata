export interface Workspace {
  name: string;
  owner: string;
  visibility: 'private' | 'public' | 'shared';
  access: 'own' | 'public' | 'shared';
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Thread {
  id: string;
}

export interface User {
  id: number;
  username: string;
  role: string;
}

export interface Session {
  username: string;
  role: string;
}

export interface Group {
  name: string;
  members: string[];
}
