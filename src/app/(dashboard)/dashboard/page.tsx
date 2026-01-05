"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus, Clock, Mic, Play, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface Story {
  id: string;
  title: string;
  prompt: string;
  content: string;
  ageGroup: string;
  childName: string | null;
  duration: number | null;
  status: string;
  createdAt: string;
  voice: { name: string } | null;
}

export default function DashboardPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      const res = await fetch("/api/stories");
      const data = await res.json();
      if (res.ok) {
        setStories(data.stories);
      }
    } catch {
      toast.error("Failed to load stories");
    } finally {
      setLoading(false);
    }
  };

  const deleteStory = async (id: string) => {
    if (!confirm("Are you sure you want to delete this story?")) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/stories/${id}`, { method: "DELETE" });
      if (res.ok) {
        setStories(stories.filter((s) => s.id !== id));
        toast.success("Story deleted");
      } else {
        throw new Error();
      }
    } catch {
      toast.error("Failed to delete story");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "--:--";
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

  const getAgeGroupLabel = (ageGroup: string) => {
    const labels: Record<string, string> = {
      TODDLER: "1-3 yrs",
      PRESCHOOL: "3-5 yrs",
      EARLY_READER: "5-7 yrs",
      CHAPTER_BOOK: "7-10 yrs",
    };
    return labels[ageGroup] || ageGroup;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-night)]">My Stories</h1>
          <p className="text-[var(--color-twilight)] mt-1">
            Your collection of magical bedtime tales
          </p>
        </div>
        <Link href="/create" className="btn-golden flex items-center justify-center gap-2 w-fit">
          <Plus className="w-5 h-5" />
          Create Story
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-lavender)]/20 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-[var(--color-lavender)]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--color-night)]">{stories.length}</p>
            <p className="text-sm text-[var(--color-dusk)]">Total Stories</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-mint)]/20 flex items-center justify-center">
            <Clock className="w-6 h-6 text-[var(--color-mint)]" />
          </div>
          <div>
            <p className="text-2xl font-bold text-[var(--color-night)]">
              {formatDuration(stories.reduce((acc, s) => acc + (s.duration || 0), 0))}
            </p>
            <p className="text-sm text-[var(--color-dusk)]">Total Duration</p>
          </div>
        </div>
        <Link href="/voices" className="card flex items-center gap-4 hover:border-[var(--color-coral)] transition-colors">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-coral)]/20 flex items-center justify-center">
            <Mic className="w-6 h-6 text-[var(--color-coral)]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--color-night)]">Voice Setup</p>
            <p className="text-sm text-[var(--color-dusk)]">Clone your voice →</p>
          </div>
        </Link>
      </div>

      {/* Stories Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-lavender)]" />
        </div>
      ) : stories.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 rounded-full bg-[var(--color-moonlight)] flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-[var(--color-dusk)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-night)] mb-2">
            No stories yet
          </h2>
          <p className="text-[var(--color-twilight)] mb-6">
            Create your first magical bedtime story
          </p>
          <Link href="/create" className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create Story
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {stories.map((story) => (
            <div
              key={story.id}
              className="card group relative overflow-hidden"
            >
              {/* Status badge */}
              {story.status !== "READY" && (
                <div className="absolute top-4 right-4 px-2 py-1 rounded-full text-xs font-medium bg-[var(--color-golden)]/20 text-[var(--color-twilight)]">
                  {story.status === "GENERATING" ? "Generating..." : story.status}
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-bold text-[var(--color-night)] line-clamp-1">
                  {story.title}
                </h3>
                <p className="text-sm text-[var(--color-dusk)] mt-1">
                  {formatDate(story.createdAt)} • {getAgeGroupLabel(story.ageGroup)}
                </p>
              </div>

              <p className="text-[var(--color-twilight)] text-sm line-clamp-3 mb-4">
                {story.content || story.prompt}
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-[var(--color-moonlight)]">
                <div className="flex items-center gap-2 text-sm text-[var(--color-dusk)]">
                  <Clock className="w-4 h-4" />
                  {formatDuration(story.duration)}
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/stories/${story.id}`}
                    className="p-2 rounded-lg bg-[var(--color-lavender)]/10 text-[var(--color-lavender)] hover:bg-[var(--color-lavender)]/20 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => deleteStory(story.id)}
                    disabled={deletingId === story.id}
                    className="p-2 rounded-lg bg-[var(--color-coral)]/10 text-[var(--color-coral)] hover:bg-[var(--color-coral)]/20 transition-colors disabled:opacity-50"
                  >
                    {deletingId === story.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {story.voice && (
                <div className="mt-3 flex items-center gap-2 text-xs text-[var(--color-dusk)]">
                  <Mic className="w-3 h-3" />
                  {story.voice.name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

