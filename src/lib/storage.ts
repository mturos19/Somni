"use client";

import type { Story } from "./story";
import type { GroupId } from "./elements";
import type { PageTiming } from "./narration";

/**
 * Local-first persistence. Everything a family creates - profiles, stories, and
 * the narrated audio - lives in this browser and is never uploaded anywhere.
 */

const DB_NAME = "somni";
/**
 * v2 replaced the per-page audio blobs with per-segment clips that also carry
 * word timings. Cached narration is always re-creatable from the story, so the
 * upgrade drops the old store rather than trying to migrate it.
 */
const DB_VERSION = 2;

export const STORES = {
  profiles: "profiles",
  stories: "stories",
  clips: "clips",
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
      if (db.objectStoreNames.contains("audio")) db.deleteObjectStore("audio");
      if (!db.objectStoreNames.contains(STORES.clips)) {
        db.createObjectStore(STORES.clips);
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
    await clips.clearStory(id);
  },
};

/* ----------------------------------- clips ----------------------------------- */

export type SavedClip = {
  audio: Blob;
  duration: number;
  precise: boolean;
  pages: PageTiming[];
};

const clipKey = (storyId: string, segment: number, voiceId: string) =>
  `${storyId}::${voiceId}::${segment}`;

export const clips = {
  get: (storyId: string, segment: number, voiceId: string) =>
    safe(
      run<SavedClip | undefined>(STORES.clips, "readonly", (s) =>
        s.get(clipKey(storyId, segment, voiceId)),
      ),
      undefined,
    ),
  put: (storyId: string, segment: number, voiceId: string, clip: SavedClip) =>
    safe(
      run(STORES.clips, "readwrite", (s) =>
        s.put(clip, clipKey(storyId, segment, voiceId)),
      ),
      undefined,
    ),
  async clearStory(storyId: string) {
    try {
      const db = await openDb();
      const tx = db.transaction(STORES.clips, "readwrite");
      const store = tx.objectStore(STORES.clips);
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
      console.warn("[storage] could not clear narration", err);
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
