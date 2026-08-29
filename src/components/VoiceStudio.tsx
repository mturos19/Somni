"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeNarration } from "@/lib/audio";
import { voices as voiceStore, type SavedVoice } from "@/lib/storage";
import type { SpeakRequest } from "@/lib/narration";

/** Kept in step with VoiceMode in elevenlabs.ts, which is server-only. */
type VoiceMode = "steady" | "natural" | "lively";

const VOICE_MODES: { id: VoiceMode; label: string; blurb: string }[] = [
  {
    id: "steady",
    label: "Steady",
    blurb: "Plain and even. The safest read, and the flattest.",
  },
  {
    id: "natural",
    label: "Natural",
    blurb: "Real intonation, still unmistakably you. Start here.",
  },
  {
    id: "lively",
    label: "Lively",
    blurb: "Acts the story out. Livelier, and further from your recording.",
  },
];

/**
 * Three passages rather than one long read. Varied prosody - warm, playful,
 * then slow and sleepy - gives the clone a much better range than a minute of
 * flat reading, and the last one is the register it will spend most of its
 * life in.
 *
 * This is the single biggest lever on how alive the finished narration sounds.
 * A voice clone copies performance, not just timbre: read these three flatly
 * and every story afterwards will be read back just as flatly, no matter what
 * the model is asked to do with it. The directions say so in as many words.
 */
const PASSAGES = [
  {
    id: "warm",
    title: "Warm and ordinary",
    direction:
      "Out loud, at normal volume, the way you would actually talk to your child. Not a reading voice.",
    text: `Once, at the far end of an ordinary street, there was a house with a blue door and a slightly wonky gate. Nobody thought anything of it. The postman walked past it twice a day. But on the last Tuesday of every month, if you happened to be looking at exactly the right moment, the gate would swing open all on its own, and something small and quick would slip out into the garden and disappear behind the roses.`,
  },
  {
    id: "playful",
    title: "Bright and playful",
    direction:
      "Bigger and sillier. Do the duck. Let your voice jump around - this is the range the clone will borrow from.",
    text: `Well! said the duck, who was not used to being interrupted. That is the third time this morning! She flapped once, twice, and then, because she was a duck of considerable drama, a third time for good measure. Everyone stop where you are! she shouted. Somebody has stolen my extremely important hat, and I intend to find it before lunch!`,
  },
  {
    id: "sleepy",
    title: "Slow and sleepy",
    direction:
      "The bedtime voice. Quiet, unhurried, almost a whisper. This is the one it will use most.",
    text: `The lanterns went out one by one, and the harbour went quiet, and the little boat rocked so gently that you could barely tell it was moving at all. Somewhere far off, a bell rang twice, and then did not ring again. It was very late now. The sea breathed in, and out, and in again, and everybody who was still awake decided, quietly, that they no longer were.`,
  },
] as const;

type Recording = { blob: Blob; url: string; seconds: number };

/**
 * Long enough for Eleven v3 to settle, and written to expose a flat clone:
 * it needs warmth, a beat of comedy and a soft landing inside four sentences.
 */
const PREVIEW_TEXT = `Once, at the far end of an ordinary street, there was a house with a blue door and a slightly wonky gate. And behind that door, at the top of the stairs, someone very small was pretending, extremely badly, to be fast asleep. Goodnight, said the house. Goodnight, said the gate.`;

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function VoiceStudio({
  available,
  selectedVoiceId,
  mode,
  onModeChange,
  onSelectVoice,
  onClose,
}: {
  available: boolean;
  selectedVoiceId: string | null;
  mode: VoiceMode;
  onModeChange: (mode: VoiceMode) => void;
  onSelectVoice: (voiceId: string | null) => void;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<SavedVoice[]>([]);
  const [consent, setConsent] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [recordings, setRecordings] = useState<Record<string, Recording>>({});
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  /** Set once, a few seconds in, if the microphone is hearing nothing. */
  const [silent, setSilent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  /**
   * The meter is written straight to the DOM.
   *
   * It used to be React state set on every animation frame, which re-rendered
   * this whole panel sixty times a second while recording - the bar stuttered
   * and the Stop button lagged behind the tap. Nothing else on screen depends
   * on the level, so nothing else needs to know it changed.
   */
  const meterRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const recordingsRef = useRef(recordings);
  const previewRef = useRef<{ el: HTMLAudioElement; url: string } | null>(null);

  useEffect(() => {
    recordingsRef.current = recordings;
  }, [recordings]);

  useEffect(() => {
    void voiceStore.all().then(setSaved);
  }, []);

  const teardownMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (meterRef.current) meterRef.current.style.width = "0%";
  }, []);

  const stopPreview = useCallback(() => {
    if (previewRef.current) {
      previewRef.current.el.pause();
      URL.revokeObjectURL(previewRef.current.url);
      previewRef.current = null;
    }
    setPreviewing(null);
  }, []);

  // Release the microphone and any object URLs when the studio closes.
  useEffect(() => {
    const recorded = recordingsRef.current;
    return () => {
      teardownMic();
      stopPreview();
      Object.values(recorded).forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, [teardownMic, stopPreview]);

  /**
   * Reads a sample line back in the finished clone, through exactly the same
   * route a story uses. Hearing it here is the moment to notice a flat take and
   * record it again, rather than at bedtime with a child waiting.
   */
  async function previewVoice(voiceId: string) {
    if (previewing === voiceId) {
      stopPreview();
      return;
    }

    stopPreview();
    setError(null);
    setPreviewing(voiceId);

    try {
      const body: SpeakRequest = {
        voiceId,
        mode,
        pages: [{ page: 0, text: PREVIEW_TEXT, mood: "calm" }],
      };

      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setError(detail.hint ? `${detail.error} ${detail.hint}` : detail.error);
        setPreviewing(null);
        return;
      }

      const url = URL.createObjectURL(decodeNarration(await res.arrayBuffer()).audio);
      const el = new Audio(url);
      previewRef.current = { el, url };
      el.onended = stopPreview;
      await el.play();
    } catch {
      setError("Could not play that back.");
      setPreviewing(null);
    }
  }

  async function startRecording(passageId: string) {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Live level meter, so nobody records ninety seconds into a muted mic.
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      // Some smoothing in the analyser itself, so the numbers arrive calm.
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      let shown = 0;
      let loudestSoFar = 0;
      /** Latched, so the check does not set state on every single frame. */
      let verdict: boolean | null = null;
      // The audio context's own clock, rather than a wall clock: it is exact,
      // it is already here, and it is a property read rather than a call.
      const startedAt = ctx.currentTime;

      const tick = () => {
        analyser.getByteTimeDomainData(samples);

        // RMS rather than peak: peak jumps on every consonant and reads as a
        // broken bar, where RMS tracks how loud the room actually is.
        let sum = 0;
        for (const sample of samples) {
          const centred = (sample - 128) / 128;
          sum += centred * centred;
        }
        const rms = Math.sqrt(sum / samples.length);
        const level = Math.min(1, rms * 4.5);
        loudestSoFar = Math.max(loudestSoFar, level);

        // Fast to rise, slow to fall - how a real meter behaves, and what stops
        // it flickering between syllables.
        shown = level > shown ? level : shown + (level - shown) * 0.12;

        if (meterRef.current) {
          meterRef.current.style.width = `${Math.max(2, shown * 100)}%`;
        }

        // Three seconds of near-silence means the wrong input, or a muted one.
        if (verdict === null && ctx.currentTime - startedAt > 3) {
          verdict = loudestSoFar < 0.04;
          setSilent(verdict);
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        // Length comes from the same counter that drives the on-screen timer,
        // so the two can never disagree.
        const seconds = elapsedRef.current;
        // The URL is minted outside the updater so a double-invoked updater in
        // StrictMode cannot orphan one.
        const url = URL.createObjectURL(blob);
        const previous = recordingsRef.current[passageId];
        if (previous) URL.revokeObjectURL(previous.url);
        setRecordings((prev) => ({ ...prev, [passageId]: { blob, url, seconds } }));
        teardownMic();
      };

      // A timeslice flushes a chunk a second rather than holding a whole
      // ninety-second passage in one buffer, which is kinder to a phone.
      recorder.start(1000);
      setSilent(false);
      setRecordingId(passageId);
      elapsedRef.current = 0;
      setElapsed(0);
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);
    } catch {
      setError(
        "Could not reach the microphone. Check that your browser has permission.",
      );
      teardownMic();
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecordingId(null);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  const recordedCount = Object.keys(recordings).length;
  const totalSeconds = Object.values(recordings).reduce((sum, r) => sum + r.seconds, 0);
  const canClone = consent && recordedCount > 0 && voiceName.trim().length > 0;

  async function createVoice() {
    if (!canClone) return;
    setCloning(true);
    setError(null);
    setStatus("Sending your recordings to be cloned...");

    try {
      const form = new FormData();
      form.append("name", voiceName.trim());
      form.append("consent", "own-voice-confirmed");
      for (const [passageId, rec] of Object.entries(recordings)) {
        const ext = extensionFor(rec.blob.type);
        form.append("samples", rec.blob, `${passageId}.${ext}`);
      }

      const res = await fetch("/api/voice/clone", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}) as Record<string, string>);

      if (!res.ok) {
        setError(
          data.error
            ? data.hint
              ? `${data.error} ${data.hint}`
              : data.error
            : "The voice service turned that down without saying why.",
        );
        setStatus(null);
        return;
      }

      const record: SavedVoice = {
        voiceId: data.voiceId,
        name: data.name,
        requiresVerification: data.requiresVerification,
        createdAt: Date.now(),
      };
      await voiceStore.save(record);
      setSaved(await voiceStore.all());
      onSelectVoice(record.voiceId);
      setStatus(
        record.requiresVerification
          ? "Voice created. ElevenLabs needs you to verify it in their dashboard before it can be used."
          : "Your voice is ready. Every story from now on can be read in it.",
      );

      Object.values(recordings).forEach((r) => URL.revokeObjectURL(r.url));
      setRecordings({});
      setVoiceName("");
    } catch {
      setError("Could not reach the voice service.");
      setStatus(null);
    } finally {
      setCloning(false);
    }
  }

  async function deleteVoice(voiceId: string) {
    await fetch(`/api/voice/list?voiceId=${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
    }).catch(() => {});
    await voiceStore.remove(voiceId);
    setSaved(await voiceStore.all());
    if (selectedVoiceId === voiceId) onSelectVoice(null);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 backdrop-blur-sm"
        style={{ background: "rgba(0,0,0,0.55)" }}
        onClick={onClose}
      />
      <div className="relative mx-auto my-6 w-full max-w-2xl px-4">
        <div className="glass-strong animate-rise rounded-3xl p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl">
                Your voice
              </h2>
              <p className="ink-soft mt-1 text-sm">
                Record three short passages and every story can be read aloud in
                your voice, even when you are not there.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-full px-3 py-1.5 text-sm"
              style={{ background: "var(--card-strong)" }}
            >
              Done
            </button>
          </div>

          {!available && (
            <Notice tone="warn">
              Voice cloning is not connected. Add an <code>ELEVENLABS_API_KEY</code>{" "}
              to <code>.env.local</code> and restart. Until then, stories are
              narrated with your device&apos;s built-in voice.
            </Notice>
          )}

          {/* Saved voices */}
          {saved.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-wider">
                Saved voices
              </h3>
              <div className="mt-3 space-y-2">
                {saved.map((voice) => {
                  const active = voice.voiceId === selectedVoiceId;
                  return (
                    <div
                      key={voice.voiceId}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3"
                      style={{
                        background: "var(--card-strong)",
                        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">
                          {voice.name}
                        </div>
                        {voice.requiresVerification && (
                          <div className="text-[11px]" style={{ color: "var(--accent-2)" }}>
                            Needs verification in your ElevenLabs dashboard
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void previewVoice(voice.voiceId)}
                        disabled={!available}
                        className="rounded-full px-3 py-1.5 text-xs disabled:opacity-40"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        {previewing === voice.voiceId ? "Stop" : "Hear it"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectVoice(active ? null : voice.voiceId)}
                        className="rounded-full px-3 py-1.5 text-xs font-semibold"
                        style={{
                          background: active ? "var(--accent)" : "transparent",
                          color: active ? "var(--accent-ink)" : "var(--ink)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {active ? "In use" : "Use"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteVoice(voice.voiceId)}
                        aria-label={`Delete ${voice.name}`}
                        className="ink-soft rounded-full px-2 py-1.5 text-xs hover:opacity-100"
                      >
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* How to read */}
          {saved.length > 0 && (
            <div
              className="mt-4 rounded-2xl p-4"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <h3 className="text-sm font-bold uppercase tracking-wider">
                How it reads
              </h3>
              <p className="ink-soft mt-1 text-xs">
                Change this, then press <strong>Hear it</strong> above. Judging it
                by ear takes ten seconds and beats any description.
              </p>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {VOICE_MODES.map((option) => {
                  const on = option.id === mode;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onModeChange(option.id)}
                      aria-pressed={on}
                      className="rounded-2xl px-2 py-2.5 text-xs font-bold transition active:scale-[0.98]"
                      style={{
                        background: on ? "var(--accent)" : "var(--card-strong)",
                        color: on ? "var(--accent-ink)" : "var(--ink)",
                        border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <p className="ink-soft mt-2 text-xs">
                {VOICE_MODES.find((option) => option.id === mode)?.blurb}
              </p>
            </div>
          )}

          {/* Consent */}
          <div
            className="mt-6 rounded-2xl p-4"
            style={{ background: "var(--card-strong)", border: "1px solid var(--border)" }}
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
              />
              <span className="text-sm">
                <strong>This is my own voice</strong>, or I have the explicit
                permission of the person speaking.
                <span className="ink-soft block text-xs">
                  Cloning someone&apos;s voice without their consent is not
                  something this app will help with. ElevenLabs may also ask you
                  to read a short verification phrase to prove the voice is yours.
                </span>
              </span>
            </label>
          </div>

          {/* Recording */}
          <fieldset disabled={!consent} className={consent ? "" : "opacity-40"}>
            <div className="mt-6 space-y-3">
              {PASSAGES.map((passage, index) => {
                const rec = recordings[passage.id];
                const isRecording = recordingId === passage.id;
                return (
                  <div
                    key={passage.id}
                    className="rounded-2xl p-4"
                    style={{
                      background: "var(--card)",
                      border: `1px solid ${rec ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold">
                          {index + 1}. {passage.title}
                        </div>
                        <div className="ink-soft text-xs">{passage.direction}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          isRecording ? stopRecording() : void startRecording(passage.id)
                        }
                        disabled={recordingId !== null && !isRecording}
                        className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-40"
                        style={{
                          background: isRecording ? "#ff6b6b" : "var(--accent)",
                          color: isRecording ? "#fff" : "var(--accent-ink)",
                        }}
                      >
                        {isRecording
                          ? `Stop  ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
                          : rec
                            ? "Record again"
                            : "Record"}
                      </button>
                    </div>

                    <p className="story-text mt-3 text-[15px]">{passage.text}</p>

                    {isRecording && (
                      <div className="mt-3">
                        <div
                          className="h-2 overflow-hidden rounded-full"
                          style={{ background: "var(--card-strong)" }}
                        >
                          {/* Width is written by the animation frame loop, not
                              by React - see meterRef. */}
                          <div
                            ref={meterRef}
                            className="h-full rounded-full"
                            style={{ width: "2%", background: "var(--accent)" }}
                          />
                        </div>
                        <p className="mt-2 text-xs" style={{ color: silent ? "#ffb4b4" : "var(--ink-soft)" }}>
                          {silent
                            ? "We cannot hear anything. Check the microphone your browser is using, then record again."
                            : "Recording. Speak at a normal volume, about a hand's width from the microphone."}
                        </p>
                      </div>
                    )}

                    {rec && !isRecording && (
                      <div className="mt-3 flex items-center gap-3">
                        <audio controls src={rec.url} className="h-9 w-full max-w-xs" />
                        <span className="ink-soft text-xs">{rec.seconds}s</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-5">
              <label htmlFor="voice-name" className="text-sm font-bold">
                Name this voice
              </label>
              <input
                id="voice-name"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                maxLength={40}
                placeholder="Mum"
                className="mt-2 w-full rounded-2xl px-4 py-3 text-sm outline-none placeholder:opacity-40"
                style={{
                  background: "var(--card-strong)",
                  border: "1px solid var(--border)",
                  color: "var(--ink)",
                }}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void createVoice()}
                disabled={!canClone || cloning || !available}
                className="rounded-full px-6 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              >
                {cloning ? "Creating your voice..." : "Create my voice"}
              </button>
              <span className="ink-soft text-xs">
                {recordedCount === 0
                  ? "Record at least one passage. All three gives the best result."
                  : `${recordedCount} of 3 recorded  ·  ${totalSeconds}s of audio`}
              </span>
            </div>
          </fieldset>

          {status && <Notice tone="ok">{status}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </div>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "error";
  children: React.ReactNode;
}) {
  const border =
    tone === "error" ? "#ff8a8a" : tone === "warn" ? "var(--accent-2)" : "var(--accent)";
  return (
    <div
      className="mt-5 rounded-2xl px-4 py-3 text-sm"
      style={{ background: "var(--card-strong)", borderLeft: `3px solid ${border}` }}
    >
      {children}
    </div>
  );
}
