"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Clock,
  Mic,
  Download,
  Loader2,
  Moon,
  Sun,
} from "lucide-react";
import toast from "react-hot-toast";

interface Story {
  id: string;
  title: string;
  content: string;
  ageGroup: string;
  childName: string | null;
  duration: number | null;
  status: string;
  createdAt: string;
  voice: {
    id: string;
    name: string;
    elevenLabsId: string | null;
    status: string;
  } | null;
}

export default function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchStory();
  }, [id]);

  const fetchStory = async () => {
    try {
      const res = await fetch(`/api/stories/${id}`);
      const data = await res.json();
      if (res.ok) {
        setStory(data.story);
      } else {
        toast.error("Story not found");
      }
    } catch {
      toast.error("Failed to load story");
    } finally {
      setLoading(false);
    }
  };

  const generateAudio = async () => {
    if (!story) return;

    setAudioLoading(true);
    try {
      const res = await fetch(`/api/stories/${story.id}/audio`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate audio");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      toast.success("Audio ready! Press play to listen");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate audio");
    } finally {
      setAudioLoading(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
    setProgress(progress);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    audioRef.current.currentTime = percentage * audioRef.current.duration;
  };

  const downloadAudio = () => {
    if (!audioUrl || !story) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `${story.title.replace(/[^a-z0-9]/gi, "_")}.mp3`;
    a.click();
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getAgeGroupLabel = (ageGroup: string) => {
    const labels: Record<string, string> = {
      TODDLER: "1-3 years",
      PRESCHOOL: "3-5 years",
      EARLY_READER: "5-7 years",
      CHAPTER_BOOK: "7-10 years",
    };
    return labels[ageGroup] || ageGroup;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-lavender)]" />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-night)] mb-4">
          Story not found
        </h1>
        <Link href="/dashboard" className="btn-primary">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-500 ${nightMode ? "night-mode" : ""}`}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/dashboard"
            className={`inline-flex items-center gap-2 transition-colors ${
              nightMode
                ? "text-[var(--color-moonlight)] hover:text-white"
                : "text-[var(--color-dusk)] hover:text-[var(--color-twilight)]"
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Stories
          </Link>
          <button
            onClick={() => setNightMode(!nightMode)}
            className={`p-2 rounded-lg transition-colors ${
              nightMode
                ? "bg-white/10 text-[var(--color-golden)]"
                : "bg-[var(--color-moonlight)] text-[var(--color-dusk)]"
            }`}
          >
            {nightMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        {/* Story Header */}
        <div className="mb-8">
          <h1
            className={`text-3xl sm:text-4xl font-bold mb-3 ${
              nightMode ? "text-white" : "text-[var(--color-night)]"
            }`}
          >
            {story.title}
          </h1>
          <div
            className={`flex flex-wrap items-center gap-4 text-sm ${
              nightMode ? "text-[var(--color-moonlight)]" : "text-[var(--color-dusk)]"
            }`}
          >
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formatDuration(story.duration)}
            </span>
            <span>{getAgeGroupLabel(story.ageGroup)}</span>
            {story.voice && (
              <span className="flex items-center gap-1">
                <Mic className="w-4 h-4" />
                {story.voice.name}
              </span>
            )}
            {story.childName && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--color-golden)]/20 text-[var(--color-golden)]">
                Featuring {story.childName}
              </span>
            )}
          </div>
        </div>

        {/* Audio Player */}
        <div
          className={`rounded-2xl p-6 mb-8 ${
            nightMode
              ? "bg-white/5"
              : "bg-gradient-to-r from-[var(--color-twilight)] to-[var(--color-night)]"
          }`}
        >
          {audioUrl ? (
            <>
              <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
              />
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlay}
                  className="w-14 h-14 rounded-full bg-[var(--color-golden)] flex items-center justify-center hover:scale-105 transition-transform"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 text-[var(--color-night)]" />
                  ) : (
                    <Play className="w-6 h-6 text-[var(--color-night)] ml-1" />
                  )}
                </button>

                <div className="flex-1">
                  <div
                    className="h-2 bg-white/20 rounded-full cursor-pointer overflow-hidden"
                    onClick={handleSeek}
                  >
                    <div
                      className="h-full bg-[var(--color-golden)] rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <button
                  onClick={toggleMute}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>

                <button
                  onClick={downloadAudio}
                  className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-white/80 mb-4">
                Generate audio narration for this story
              </p>
              <button
                onClick={generateAudio}
                disabled={audioLoading}
                className="btn-golden inline-flex items-center gap-2"
              >
                {audioLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating audio...
                  </>
                ) : (
                  <>
                    <Volume2 className="w-5 h-5" />
                    Generate Audio
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Story Content */}
        <div
          className={`rounded-2xl p-8 ${
            nightMode ? "bg-white/5" : "bg-white shadow-lg"
          }`}
        >
          <div className="story-text whitespace-pre-wrap">
            {story.content.split("\n\n").map((paragraph, index) => (
              <p key={index} className="mb-6 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

