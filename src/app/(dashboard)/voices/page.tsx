"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mic,
  Upload,
  Loader2,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Play,
  Square,
  Info,
} from "lucide-react";
import toast from "react-hot-toast";

interface Voice {
  id: string;
  name: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  createdAt: string;
}

export default function VoicesPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchVoices();
  }, []);

  const fetchVoices = async () => {
    try {
      const res = await fetch("/api/voices");
      const data = await res.json();
      if (res.ok) {
        setVoices(data.voices);
      }
    } catch {
      toast.error("Failed to load voices");
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast.error("Could not access microphone. Please allow microphone access.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const clearRecording = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("audio/")) {
        toast.error("Please upload an audio file");
        return;
      }
      setAudioBlob(file);
      setAudioUrl(URL.createObjectURL(file));
    }
  };

  const uploadVoice = async () => {
    if (!audioBlob || !voiceName.trim()) {
      toast.error("Please provide a name and audio sample");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("name", voiceName.trim());
      formData.append("audio", audioBlob, "voice-sample.webm");

      const res = await fetch("/api/voices", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to clone voice");
      }

      toast.success("Voice cloned successfully! ✨");
      setVoices([data.voice, ...voices]);
      setVoiceName("");
      clearRecording();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clone voice");
    } finally {
      setUploading(false);
    }
  };

  const deleteVoice = async (id: string) => {
    if (!confirm("Are you sure you want to delete this voice?")) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/voices/${id}`, { method: "DELETE" });
      if (res.ok) {
        setVoices(voices.filter((v) => v.id !== id));
        toast.success("Voice deleted");
      } else {
        throw new Error();
      }
    } catch {
      toast.error("Failed to delete voice");
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusInfo = (status: Voice["status"]) => {
    switch (status) {
      case "READY":
        return { icon: CheckCircle, color: "text-[var(--color-mint)]", label: "Ready" };
      case "PROCESSING":
        return { icon: Clock, color: "text-[var(--color-golden)]", label: "Processing" };
      case "FAILED":
        return { icon: AlertCircle, color: "text-[var(--color-coral)]", label: "Failed" };
      default:
        return { icon: Clock, color: "text-[var(--color-dusk)]", label: "Pending" };
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[var(--color-dusk)] hover:text-[var(--color-twilight)] transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-[var(--color-night)]">Voice Studio</h1>
        <p className="text-[var(--color-twilight)] mt-1">
          Clone your voice to narrate bedtime stories
        </p>
      </div>

      {/* Clone Voice Card */}
      <div className="card mb-8">
        <h2 className="text-xl font-bold text-[var(--color-night)] mb-2">
          Clone a New Voice
        </h2>
        <p className="text-[var(--color-twilight)] mb-6">
          Record or upload a 30+ second audio sample of your voice reading naturally
        </p>

        {/* Info box */}
        <div className="bg-[var(--color-lavender)]/10 rounded-xl p-4 mb-6 flex gap-3">
          <Info className="w-5 h-5 text-[var(--color-lavender)] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--color-twilight)]">
            <p className="font-medium text-[var(--color-night)] mb-1">Tips for best results:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Record in a quiet environment without background noise</li>
              <li>Speak naturally at your normal reading pace</li>
              <li>Try reading a paragraph from a book or story</li>
              <li>30-60 seconds of audio works best</li>
            </ul>
          </div>
        </div>

        {/* Voice Name */}
        <div className="mb-6">
          <label className="label">Voice Name</label>
          <input
            type="text"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            placeholder="Mom's Voice"
            className="input-field"
          />
        </div>

        {/* Recording / Upload */}
        {!audioBlob ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Record */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-6 rounded-xl border-2 border-dashed text-center transition-all ${
                isRecording
                  ? "border-[var(--color-coral)] bg-[var(--color-coral)]/5"
                  : "border-[var(--color-moonlight)] hover:border-[var(--color-lavender)]"
              }`}
            >
              <div
                className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${
                  isRecording
                    ? "bg-[var(--color-coral)] animate-pulse"
                    : "bg-[var(--color-moonlight)]"
                }`}
              >
                {isRecording ? (
                  <Square className="w-6 h-6 text-white" />
                ) : (
                  <Mic className="w-6 h-6 text-[var(--color-dusk)]" />
                )}
              </div>
              {isRecording ? (
                <>
                  <p className="font-semibold text-[var(--color-coral)]">Recording...</p>
                  <p className="text-2xl font-bold text-[var(--color-night)] mt-1">
                    {formatTime(recordingTime)}
                  </p>
                  <p className="text-sm text-[var(--color-dusk)] mt-2">Click to stop</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-[var(--color-night)]">Record Voice</p>
                  <p className="text-sm text-[var(--color-dusk)]">Click to start recording</p>
                </>
              )}
            </button>

            {/* Upload */}
            <label className="p-6 rounded-xl border-2 border-dashed border-[var(--color-moonlight)] hover:border-[var(--color-lavender)] text-center cursor-pointer transition-all">
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-full bg-[var(--color-moonlight)] mx-auto mb-3 flex items-center justify-center">
                <Upload className="w-6 h-6 text-[var(--color-dusk)]" />
              </div>
              <p className="font-semibold text-[var(--color-night)]">Upload Audio</p>
              <p className="text-sm text-[var(--color-dusk)]">MP3, WAV, or M4A</p>
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Audio Preview */}
            <div className="bg-[var(--color-moonlight)] rounded-xl p-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    const audio = new Audio(audioUrl!);
                    audio.play();
                  }}
                  className="w-12 h-12 rounded-full bg-[var(--color-lavender)] flex items-center justify-center hover:scale-105 transition-transform"
                >
                  <Play className="w-5 h-5 text-white ml-0.5" />
                </button>
                <div className="flex-1">
                  <p className="font-medium text-[var(--color-night)]">Voice Sample</p>
                  <p className="text-sm text-[var(--color-dusk)]">
                    {recordingTime > 0 ? formatTime(recordingTime) : "Uploaded file"}
                  </p>
                </div>
                <button
                  onClick={clearRecording}
                  className="p-2 rounded-lg text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={uploadVoice}
              disabled={uploading || !voiceName.trim()}
              className="btn-golden w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cloning voice...
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  Clone Voice
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Voices List */}
      <div>
        <h2 className="text-xl font-bold text-[var(--color-night)] mb-4">Your Voices</h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--color-lavender)]" />
          </div>
        ) : voices.length === 0 ? (
          <div className="text-center py-12 bg-white/50 rounded-2xl">
            <Mic className="w-12 h-12 mx-auto text-[var(--color-dusk)] mb-4" />
            <p className="text-[var(--color-twilight)]">
              No voices yet. Clone your first voice above!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {voices.map((voice) => {
              const statusInfo = getStatusInfo(voice.status);
              return (
                <div
                  key={voice.id}
                  className="card flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--color-lavender)]/20 flex items-center justify-center">
                      <Mic className="w-6 h-6 text-[var(--color-lavender)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--color-night)]">{voice.name}</p>
                      <p className="text-sm text-[var(--color-dusk)]">
                        {formatDate(voice.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-1.5 ${statusInfo.color}`}>
                      <statusInfo.icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{statusInfo.label}</span>
                    </div>

                    <button
                      onClick={() => deleteVoice(voice.id)}
                      disabled={deletingId === voice.id}
                      className="p-2 rounded-lg text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10 transition-colors disabled:opacity-50"
                    >
                      {deletingId === voice.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Trash2 className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

