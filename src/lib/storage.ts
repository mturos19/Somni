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
 * word timings; v3 added the voice mode to the clip key; v4 added the sidecar
 * index that makes narration evictable. Cached narration is always re-creatable
 * from the story, so each upgrade drops the old store rather than trying to
 * migrate it.
 */
const DB_VERSION = 4;

export const STORES = {
  profiles: "profiles",
  stories: "stories",
  clips: "clips",
  /** Size and last use per clip. See clipMeta. */
  clipMeta: "clipmeta",
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
      // Clips and their index are dropped together: an index that disagrees
      // with the store it describes is worse than no index.
      if (db.objectStoreNames.contains(STORES.clips)) {
        db.deleteObjectStore(STORES.clips);
      }
      if (db.objectStoreNames.contains(STORES.clipMeta)) {
        db.deleteObjectStore(STORES.clipMeta);
      }
      db.createObjectStore(STORES.clips);
      db.createObjectStore(STORES.clipMeta);
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

/** What a cached clip costs, and when it was last wanted. See clipMeta. */
type ClipMeta = { bytes: number; lastUsed: number };

/**
 * How much narration may sit in this browser before the least recently played
 * is dropped.
 *
 * Narration is the only thing here that is large *and* re-creatable. A ten-page
 * story is four or five segments at roughly a megabyte each, and the cache key
 * includes the voice, the mode and the name pronunciation - so one story a
 * family keeps re-reading in two voices is five or six megabytes, and a year of
 * bedtimes with nothing evicting is hundreds.
 *
 * That matters because of what fills up alongside it. Browsers give one origin
 * a single quota, so narration growing without bound eventually takes the space
 * a *story* needs - and a story is the thing with no copy anywhere else. Audio
 * can always be generated again; the story cannot be written again.
 *
 * 250 MB is comfortably inside what every mobile browser grants an installed
 * app, and holds something like forty stories' narration.
 */
const CLIP_BUDGET_BYTES = 250 * 1024 * 1024;

/**
 * Trimming goes to here rather than to the budget, so arriving at the ceiling
 * does not mean a scan and a delete on every single put from then on.
 */
const CLIP_TRIM_TARGET = Math.floor(CLIP_BUDGET_BYTES * 0.8);

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Drops the least recently played narration until the cache is back inside its
 * budget.
 *
 * Reads the sidecar index, never the clips themselves - the whole point of
 * keeping sizes in a separate store is that deciding what to evict must not
 * mean loading two hundred megabytes of audio into memory to measure it.
 */
async function trimClips(): Promise<void> {
  try {
    const db = await openDb();
    const read = db.transaction(STORES.clipMeta, "readonly").objectStore(STORES.clipMeta);
    const [keys, metas] = await Promise.all([
      request(read.getAllKeys()),
      request<ClipMeta[]>(read.getAll()),
    ]);

    let total = 0;
    for (const meta of metas) total += meta?.bytes ?? 0;
    if (total <= CLIP_BUDGET_BYTES) return;

    const oldest = keys
      .map((key, i) => ({ key, meta: metas[i] }))
      .filter((entry) => typeof entry.key === "string" && entry.meta)
      .sort((a, b) => a.meta.lastUsed - b.meta.lastUsed);

    const tx = db.transaction([STORES.clips, STORES.clipMeta], "readwrite");
    const clipStore = tx.objectStore(STORES.clips);
    const metaStore = tx.objectStore(STORES.clipMeta);

    let dropped = 0;
    for (const entry of oldest) {
      if (total <= CLIP_TRIM_TARGET) break;
      clipStore.delete(entry.key);
      metaStore.delete(entry.key);
      total -= entry.meta.bytes;
      dropped += 1;
    }

    if (dropped > 0) {
      console.info(`[storage] evicted ${dropped} cached narration segment(s)`);
    }
  } catch (err) {
    // A cache that will not trim is a slow problem; a crash here is an
    // immediate one. Let it grow and try again next time.
    console.warn("[storage] could not trim narration", err);
  }
}

/** Marks a clip as just played, which is what keeps it out of the next eviction. */
async function touchClip(key: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORES.clipMeta, "readwrite");
    const store = tx.objectStore(STORES.clipMeta);
    const meta = await request<ClipMeta | undefined>(store.get(key));
    if (!meta) return;
    store.put({ ...meta, lastUsed: Date.now() }, key);
  } catch {
    /* losing a timestamp only risks evicting something slightly too early */
  }
}

export const clips = {
  async get(key: string): Promise<SavedClip | undefined> {
    const clip = await safe(
      run<SavedClip | undefined>(STORES.clips, "readonly", (s) => s.get(key)),
      undefined,
    );
    // Deliberately not awaited: the reader is waiting on this clip, and the
    // bookkeeping behind it is nobody's business but the next eviction's.
    if (clip) void touchClip(key);
    return clip;
  },

  async put(key: string, clip: SavedClip): Promise<void> {
    try {
      const db = await openDb();
      const tx = db.transaction([STORES.clips, STORES.clipMeta], "readwrite");
      tx.objectStore(STORES.clips).put(clip, key);
      tx.objectStore(STORES.clipMeta).put(
        { bytes: clip.audio.size, lastUsed: Date.now() } satisfies ClipMeta,
        key,
      );
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (err) {
      console.warn("[storage] could not cache narration", err);
      return;
    }
    void trimClips();
  },

  async clearStory(storyId: string) {
    try {
      const db = await openDb();
      const tx = db.transaction([STORES.clips, STORES.clipMeta], "readwrite");
      const clipStore = tx.objectStore(STORES.clips);
      const metaStore = tx.objectStore(STORES.clipMeta);
      const keys = await request(clipStore.getAllKeys());
      for (const key of keys) {
        if (typeof key === "string" && key.startsWith(`${storyId}::`)) {
          clipStore.delete(key);
          metaStore.delete(key);
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
