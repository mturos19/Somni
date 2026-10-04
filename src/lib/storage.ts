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
 * word timings; v3 added the voice mode to the clip key. Cached narration is
 * always re-creatable from the story, so each upgrade drops the old store
 * rather than trying to migrate it.
 */
const DB_VERSION = 3;

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
  /** How narration is read. See VoiceMode in elevenlabs.ts. */
  voiceMode?: "steady" | "natural" | "lively";
  /** Playback rate for narration. 1 is the pace it was generated at. */
  readingSpeed?: number;
  /** How the child's name should be said, when the spelling does not say it. */
  saysLike?: string;
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
  /** Furthest page reached, so a story left half-read can be picked back up. */
  lastPage?: number;
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
      if (db.objectStoreNames.contains(STORES.clips)) {
        db.deleteObjectStore(STORES.clips);
      }
      db.createObjectStore(STORES.clips);
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

/**
 * Asks the browser not to evict what this family has made.
 *
 * Everything Somni creates lives in this one browser and exists nowhere else -
 * there is no server copy to restore from. Without persistence granted, stories
 * and their narration are "best effort" storage and a browser clearing space
 * may simply delete them. That matters more once the app is installed, because
 * then it is expected to still be there in a month.
 *
 * Chrome grants this automatically to an installed app, Firefox prompts, and
 * Safari decides on engagement. A refusal is not an error and changes nothing
 * about how the app behaves.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
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
  /**
   * Null means the read itself failed, which is not the same as there being no
   * profile yet - and the difference matters. A caller that treats a failed
   * read as "new user" will write a blank default straight back over a real
   * profile, taking the child's name, age and the link to the cloned voice
   * with it.
   */
  async load(): Promise<ChildProfile[] | null> {
    try {
      return await run<ChildProfile[]>(STORES.profiles, "readonly", (s) => s.getAll());
    } catch (err) {
      console.warn("[storage] could not read the profile", err);
      return null;
    }
  },
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
  /**
   * Reports whether the story actually landed, unlike everything else here.
   * A story is a minute of waiting and the only copy that exists, so the one
   * case worth telling a parent about is the device refusing to keep it -
   * a full quota, or a browser with site data switched off.
   */
  async save(story: SavedStory): Promise<boolean> {
    try {
      await run(STORES.stories, "readwrite", (s) => s.put(story));
      return true;
    } catch (err) {
      console.warn("[storage] could not save story", err);
      return false;
    }
  },
  /**
   * Remembers how far a reading got. Written on each page turn, which is a
   * handful of small writes per story and worth it: bedtime gets interrupted,
   * and starting again from the cover every time is its own small defeat.
   */
  async saveProgress(id: string, lastPage: number) {
    const stored = await safe(
      run<SavedStory | undefined>(STORES.stories, "readonly", (s) => s.get(id)),
      undefined,
    );
    if (!stored || stored.lastPage === lastPage) return;
    await safe(
      run(STORES.stories, "readwrite", (s) => s.put({ ...stored, lastPage })),
      undefined,
    );
  },
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

/**
 * The variant is part of the key: the same page in the same voice is different
 * audio under a different mode or a different name pronunciation, and serving
 * the cached one back would make the setting look broken.
 */
export const clipKey = (
  storyId: string,
  segment: number,
  voiceId: string,
  variant: string,
) => `${storyId}::${voiceId}::${variant}::${segment}`;

export const clips = {
  get: (key: string) =>
    safe(run<SavedClip | undefined>(STORES.clips, "readonly", (s) => s.get(key)), undefined),
  put: (key: string, clip: SavedClip) =>
    safe(run(STORES.clips, "readwrite", (s) => s.put(clip, key)), undefined),
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
