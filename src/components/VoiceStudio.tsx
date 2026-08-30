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
    blurb: "Even and predictable. Never garbles a word, never surprises you.",
  },
  {
    id: "natural",
    label: "Natural",
    blurb: "Lets your intonation through. Start here.",
  },
  {
    id: "lively",
    label: "Lively",
    blurb: "Acts the story out. Livelier, further from your recording, and the most likely to stumble.",
  },
];

/**
 * Three short passages in one voice, not three performances.
 *
 * Both halves of that are ElevenLabs' guidance rather than taste. On total
 * length: "approximately 1-2 minutes of clear audio" is optimal, and "avoid
 * recording more than 3 minutes, this will yield little improvement and can,
 * in some cases, even be detrimental to the clone." Instant cloning is the one
 * place where more audio makes things worse, and the thing it degrades is
 * stability - heard as invented words. Thirty minutes upward is a different
 * product, Professional Voice Cloning, which trains a model instead.
 *
 * On consistency: "good consistent input = good consistent output", from "a
 * single speaker with steady tone and performance". An earlier version of this
 * file asked for warm, then broadly comic, then a whisper, on the theory that
 * range in gives range out. It does not: instant cloning builds one embedding,
 * and three different performances average into a muddier one.
 *
 * So every passage below is the same voice - the one that will read the story -
 * and the variety is in the writing instead. Description, a line of dialogue, a
 * question, a soft landing. Enough for the model to hear intonation without
 * hearing three different people.
 */
const PASSAGES = [
  {
    id: "opening",
    title: "The beginning",
    direction:
      "Read it the way you would to your child, at normal volume. This is the voice you want back.",
    text: `Once, at the far end of an ordinary street, there was a house with a blue door and a slightly wonky gate. Nobody thought anything of it. The postman walked past it twice a day and never once looked up. But on the last Tuesday of every month, if you happened to be looking at exactly the right moment, the gate would swing open all on its own.`,
  },
  {
    id: "middle",
    title: "The middle",
    direction: "Same voice. There is a question in here, and someone speaking.",
    text: `Well, said the duck, who was not used to being interrupted. Is that really where you put it? She thought about this for a while. The frog said nothing at all, which was, on balance, the wisest thing anyone said that morning. And what, said the duck at last, are we supposed to do now?`,
  },
  {
    id: "ending",
    title: "The ending",
    direction: "Same voice again, just slower. Let it settle the way you would at the last page.",
    text: `The lanterns went out one by one, and the harbour went quiet, and the little boat rocked so gently that you could barely tell it was moving at all. Somewhere far off, a bell rang twice, and then did not ring again. It was very late now. The sea breathed in, and out, and in again.`,
  },
] as const;

type Recording = {
  blob: Blob;
  url: string;
  seconds: number;
  /** Quietest moment in the take, which is the room rather than the speaker. */
  noiseFloor: number;
};

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
  const noiseFloorRef = useRef(1);
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
      /**
       * Every processor here is off on purpose, and this is the single most
       * important thing in the file.
       *
       * Browsers default this trio on because the assumption is a video call.
       * Echo cancellation, noise suppression and automatic gain are tuned to
       * make speech intelligible on a bad line: they gate quiet passages,
       * compress loud ones and level everything in between. That is precisely
       * the dynamic range a voice clone learns delivery from - so leaving them
       * on hands the model a flattened performance and then asks it to sound
       * alive. It cannot. It has never heard the parent get quiet.
       *
       * Recording raw means the room is audible, which is what the noise floor
       * measurement below is for: the isolation model runs later, once, on the
       * whole sample, instead of frame by frame while the dynamics are being
       * destroyed.
       */
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
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
      let quietestSoFar = 1;
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

        // The quietest moment after the first second is the gap between
        // sentences - which is to say, the room. It decides later whether the
        // sample needs isolating or is already clean enough to leave alone.
        if (ctx.currentTime - startedAt > 1) {
          quietestSoFar = Math.min(quietestSoFar, level);
          noiseFloorRef.current = quietestSoFar;
        }

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
      // Opus defaults vary by browser and some are low enough that codec
      // artefacts reach the clone. This is cheap insurance on a two-minute file.
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
      });
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
        const noiseFloor = noiseFloorRef.current;
        // The URL is minted outside the updater so a double-invoked updater in
        // StrictMode cannot orphan one.
        const url = URL.createObjectURL(blob);
        const previous = recordingsRef.current[passageId];
        if (previous) URL.revokeObjectURL(previous.url);
        setRecordings((prev) => ({
          ...prev,
          [passageId]: { blob, url, seconds, noiseFloor },
        }));
        teardownMic();
      };

      // A timeslice flushes a chunk a second rather than holding a whole
      // ninety-second passage in one buffer, which is kinder to a phone.
      recorder.start(1000);
      setSilent(false);
      setRecordingId(passageId);
      elapsedRef.current = 0;
      noiseFloorRef.current = 1;
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

  /**
   * Where this recording sits against ElevenLabs' own guidance: one to two
   * minutes is optimal, and past three minutes more audio "can, in some cases,
   * even be detrimental to the clone". So this is a band to land inside, not a
   * total to maximise, and it says so at both ends.
   */
  const audioVerdict =
    totalSeconds > 180
      ? {
          text: "Past the recommended maximum. More audio can make the clone less stable.",
          tone: "#ffb4b4",
        }
      : totalSeconds >= 75
        ? { text: "Right in the sweet spot.", tone: "var(--accent)" }
        : totalSeconds >= 45
          ? { text: "Workable. One more passage would help.", tone: "var(--accent-2)" }
          : { text: "Too short so far. Read another passage.", tone: "var(--ink-soft)" };

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
      // The noisiest take decides for the set: they are cloned together.
      form.append(
        "noiseFloor",
        String(
          Math.max(...Object.values(recordings).map((rec) => rec.noiseFloor), 0),
        ),
      );
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
                Read three short passages and every story can be read aloud in
                your voice, even when you are not there.
              </p>
              <p className="ink-soft mt-2 text-xs">
                Somewhere quiet, no music, phone or laptop about a hand&apos;s
                width away. How it is recorded matters more than how much there
                is - a minute and a half of clean audio beats five minutes of
                echo, and the same voice throughout beats three different ones.
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
              <div className="min-w-[220px] flex-1 text-xs">
                {recordedCount === 0 ? (
                  <span className="ink-soft">
                    Read all three. Together they come to about a minute and a
                    half, which is what an instant clone wants.
                  </span>
                ) : (
                  <>
                    {/* A band to land inside rather than a bar to fill: the
                        shaded stretch is the recommended one to sixty
                        seconds either side of ideal, and past it the marker
                        turns. */}
                    <div
                      className="relative h-1.5 overflow-hidden rounded-full"
                      style={{ background: "var(--card)" }}
                      aria-hidden
                    >
                      <div
                        className="absolute inset-y-0 rounded-full"
                        style={{
                          left: `${(60 / 210) * 100}%`,
                          width: `${(90 / 210) * 100}%`,
                          background: "var(--card-strong)",
                        }}
                      />
                      <div
                        className="absolute inset-y-0 w-1 rounded-full transition-[left] duration-300"
                        style={{
                          left: `${Math.min(99, (totalSeconds / 210) * 100)}%`,
                          background: audioVerdict.tone,
                        }}
                      />
                    </div>
                    <div className="mt-1.5">
                      <span className="ink-soft">
                        {recordedCount} of 3 · {totalSeconds}s ·{" "}
                      </span>
                      <span style={{ color: audioVerdict.tone }}>
                        {audioVerdict.text}
                      </span>
                    </div>
                  </>
                )}
              </div>
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
