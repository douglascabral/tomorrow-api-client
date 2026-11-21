import { Call } from '@wailsio/runtime';

export type Workspace = { path: string; name: string };
export type KeyValueRow = { id: string; key: string; value: string; enabled: boolean; secret?: boolean };
export type MultipartFileField = { id: string; name: string; paths: string[]; path?: string; enabled: boolean };
export type Environment = { id: string; name: string; values: Record<string, string>; secretKeys?: string[] };
export type RequestNode = { id: string; name: string; kind: 'collection' | 'folder' | 'request'; method?: string; url?: string; headers?: Record<string, string>; query?: Record<string, string>; headerRows?: KeyValueRow[]; queryRows?: KeyValueRow[]; authCredentials?: KeyValueRow[]; authType?: string; authToken?: string; authUsername?: string; authPassword?: string; bodyType?: string; filePath?: string; multipartFiles?: MultipartFileField[]; preRequestScript?: string; postResponseScript?: string; testScript?: string; body?: string; children?: RequestNode[] };
export type HTTPResponse = { url?: string; statusCode: number; status: string; headers: Record<string, string>; body: string; durationMs: number; environment?: Record<string, string>; scriptResults?: Array<{ name: string; passed: boolean; error?: string }> };
export type HistoryEntry = { name: string; method: string; url: string; status: number; timestamp: string; error?: string };

const mock = () => (window as typeof window & { __TOMORROW_API__?: Record<string, (...args: unknown[]) => Promise<unknown>> }).__TOMORROW_API__;

export const WorkspaceService = {
  SelectFolder: async (): Promise<string> => {
    const api = mock();
    if (api) return String(await api.SelectFolder());
    return Call.ByName('main.WorkspaceService.SelectFolder') as Promise<string>;
  },
  SelectFile: async (): Promise<string> => {
    const api = mock();
    if (api) return String(await api.SelectFile());
    return Call.ByName('main.WorkspaceService.SelectFile') as Promise<string>;
  },
  SelectFiles: async (): Promise<string[]> => {
    const api = mock();
    if (api) return await api.SelectFiles() as string[];
    return Call.ByName('main.WorkspaceService.SelectFiles') as Promise<string[]>;
  },
  CreateWorkspace: async (parent: string, name: string, password: string, confirmation: string): Promise<Workspace> => {
    const api = mock();
    if (api) return await api.CreateWorkspace(parent, name, password, confirmation) as Workspace;
    return Call.ByName('main.WorkspaceService.CreateWorkspace', parent, name, password, confirmation) as Promise<Workspace>;
  },
  OpenWorkspace: async (path: string, password: string): Promise<Workspace> => {
    const api = mock();
    if (api) return await api.OpenWorkspace(path, password) as Workspace;
    return Call.ByName('main.WorkspaceService.OpenWorkspace', path, password) as Promise<Workspace>;
  },
  ChangePassword: async (current: string, next: string, confirmation: string): Promise<void> => {
    const api = mock();
    if (api) { await api.ChangePassword(current, next, confirmation); return; }
    return Call.ByName('main.WorkspaceService.ChangePassword', current, next, confirmation) as Promise<void>;
  },
  Environments: async (): Promise<Environment[]> => {
    const api = mock();
    if (api) return await api.Environments() as Environment[];
    return Call.ByName('main.WorkspaceService.Environments') as Promise<Environment[]>;
  },
  SaveEnvironments: async (environments: Environment[]): Promise<void> => {
    const api = mock();
    if (api) { await api.SaveEnvironments(JSON.stringify(environments)); return; }
    return Call.ByName('main.WorkspaceService.SaveEnvironments', environments) as Promise<void>;
  },
  SavePostmanExport: async (filename: string, contents: string): Promise<void> => {
    const api = mock();
    if (api) { await api.SavePostmanExport(filename, contents); return; }
    return Call.ByName('main.WorkspaceService.SavePostmanExport', filename, contents) as Promise<void>;
  },
  Collections: async (): Promise<RequestNode[]> => {
    const api = mock();
    if (api) return await api.Collections() as RequestNode[];
    return Call.ByName('main.WorkspaceService.Collections') as Promise<RequestNode[]>;
  },
  RequestHistory: async (): Promise<HistoryEntry[]> => {
    const api = mock();
    if (api) return await api.RequestHistory() as HistoryEntry[];
    return Call.ByName('main.WorkspaceService.RequestHistory') as Promise<HistoryEntry[]>;
  },
  RemoveHistoryEntry: async (index: number): Promise<void> => {
    const api = mock();
    if (api) { await api.RemoveHistoryEntry(index); return; }
    return Call.ByName('main.WorkspaceService.RemoveHistoryEntry', index) as Promise<void>;
  },
  ClearHistory: async (): Promise<void> => {
    const api = mock();
    if (api) { await api.ClearHistory(); return; }
    return Call.ByName('main.WorkspaceService.ClearHistory') as Promise<void>;
  },
  SaveCollections: async (collections: RequestNode[]): Promise<void> => {
    const api = mock();
    if (api) { await api.SaveCollections(JSON.stringify(collections)); return; }
    return Call.ByName('main.WorkspaceService.SaveCollections', collections) as Promise<void>;
  },
  SendRequest: async (request: { timeoutSeconds: number; name: string; method: string; url: string; headers: Record<string, string>; query: Record<string, string>; authType: string; authToken: string; authUsername: string; authPassword: string; environment: Record<string, string>; preRequestScript: string; postResponseScript: string; testScript: string; body: string; bodyType: string; filePath: string; multipartFiles: MultipartFileField[] }): Promise<HTTPResponse> => {
    const api = mock();
    if (api) return await api.SendRequest(JSON.stringify(request)) as HTTPResponse;
    return Call.ByName('main.WorkspaceService.SendRequest', request) as Promise<HTTPResponse>;
  },
};
