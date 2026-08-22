"use client";

import type { Story } from "./story";
import type { GroupId } from "./elements";

/**
 * Local-first persistence. Everything a family creates - profiles, stories, and
 * the narrated audio - lives in this browser and is never uploaded anywhere.
 */

const DB_NAME = "somni";
const DB_VERSION = 1;

export const STORES = {
  profiles: "profiles",
  stories: "stories",
  audio: "audio",
  voices: "voices",
} as const;

export type ChildProfile = {
  id: string;
  name: string;
  age: number;
  themeId: string;
  voiceId: string | null;
  createdAt: number;
};

export type SavedStory = {
  id: string;
  profileId: string;
  title: string;
  story: Story;
  themeId: string;
  age: number;
  selection: Record<GroupId, string[]>;
  custom: string;
  createdAt: number;
};

export type SavedVoice = {
  voiceId: string;
  name: string;
  requiresVerification: boolean;
  createdAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.profiles)) {
        db.createObjectStore(STORES.profiles, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.stories)) {
        const store = db.createObjectStore(STORES.stories, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(STORES.audio)) {
        db.createObjectStore(STORES.audio);
      }
      if (!db.objectStoreNames.contains(STORES.voices)) {
        db.createObjectStore(STORES.voices, { keyPath: "voiceId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = fn(tx.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/**
 * Storage can fail for reasons outside our control (private windows, blocked
 * site data). Losing a saved story is never worth breaking bedtime, so callers
 * get a safe fallback instead of an exception.
 */
async function safe<T>(work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (err) {
    console.warn("[storage] falling back", err);
    return fallback;
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ---------------------------------- profiles --------------------------------- */

export const profiles = {
  all: () => safe(run<ChildProfile[]>(STORES.profiles, "readonly", (s) => s.getAll()), []),
  save: (profile: ChildProfile) =>
    safe(run(STORES.profiles, "readwrite", (s) => s.put(profile)), undefined),
  remove: (id: string) =>
    safe(run(STORES.profiles, "readwrite", (s) => s.delete(id)), undefined),
};

/* ---------------------------------- stories ---------------------------------- */

export const stories = {
  async all(): Promise<SavedStory[]> {
    const list = await safe(
      run<SavedStory[]>(STORES.stories, "readonly", (s) => s.getAll()),
      [],
    );
    return list.sort((a, b) => b.createdAt - a.createdAt);
  },
  save: (story: SavedStory) =>
    safe(run(STORES.stories, "readwrite", (s) => s.put(story)), undefined),
  async remove(id: string) {
    await safe(run(STORES.stories, "readwrite", (s) => s.delete(id)), undefined);
    await audio.clearStory(id);
  },
};

/* ----------------------------------- audio ----------------------------------- */

const audioKey = (storyId: string, page: number, voiceId: string) =>
  `${storyId}::${voiceId}::${page}`;

export const audio = {
  get: (storyId: string, page: number, voiceId: string) =>
    safe(
      run<Blob | undefined>(STORES.audio, "readonly", (s) =>
        s.get(audioKey(storyId, page, voiceId)),
      ),
      undefined,
    ),
  put: (storyId: string, page: number, voiceId: string, blob: Blob) =>
    safe(
      run(STORES.audio, "readwrite", (s) =>
        s.put(blob, audioKey(storyId, page, voiceId)),
      ),
      undefined,
    ),
  async clearStory(storyId: string) {
    try {
      const db = await openDb();
      const tx = db.transaction(STORES.audio, "readwrite");
      const store = tx.objectStore(STORES.audio);
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const key of keys) {
        if (typeof key === "string" && key.startsWith(`${storyId}::`)) {
          store.delete(key);
        }
      }
    } catch (err) {
      console.warn("[storage] could not clear audio", err);
    }
  },
};

/* ----------------------------------- voices ---------------------------------- */

export const voices = {
  all: () => safe(run<SavedVoice[]>(STORES.voices, "readonly", (s) => s.getAll()), []),
  save: (voice: SavedVoice) =>
    safe(run(STORES.voices, "readwrite", (s) => s.put(voice)), undefined),
  remove: (voiceId: string) =>
    safe(run(STORES.voices, "readwrite", (s) => s.delete(voiceId)), undefined),
};
