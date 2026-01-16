"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  Wand2,
  Baby,
  BookOpen,
  GraduationCap,
  BookMarked,
  Mic,
} from "lucide-react";
import toast from "react-hot-toast";

interface Voice {
  id: string;
  name: string;
  status: string;
}

const ageGroups = [
  { id: "TODDLER", label: "Toddler", age: "1-3 years", icon: Baby, description: "Simple words, lots of repetition" },
  { id: "PRESCHOOL", label: "Preschool", age: "3-5 years", icon: BookOpen, description: "Fantasy, talking animals" },
  { id: "EARLY_READER", label: "Early Reader", age: "5-7 years", icon: GraduationCap, description: "More adventure, emotions" },
  { id: "CHAPTER_BOOK", label: "Chapter Book", age: "7-10 years", icon: BookMarked, description: "Complex stories, twists" },
];

const storyIdeas = [
  "A friendly dragon who's afraid of fire",
  "A bunny astronaut's first trip to the moon",
  "A princess who loves to build robots",
  "A magical garden where vegetables come alive",
  "A little cloud learning to make rainbows",
];

export default function CreateStoryPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [childName, setChildName] = useState("");
  const [ageGroup, setAgeGroup] = useState("PRESCHOOL");
  const [voiceId, setVoiceId] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(true);

  useEffect(() => {
    fetchVoices();
  }, []);

  const fetchVoices = async () => {
    try {
      const res = await fetch("/api/voices");
      const data = await res.json();
      if (res.ok) {
        setVoices(data.voices.filter((v: Voice) => v.status === "READY"));
      }
    } catch {
      // Silent fail - voices are optional
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (prompt.length < 10) {
      toast.error("Please describe your story idea in more detail");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          childName: childName || undefined,
          ageGroup,
          voiceId: voiceId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create story");
      }

      toast.success("Story created! ✨");
      router.push(`/stories/${data.story.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const useIdeaSuggestion = () => {
    const randomIdea = storyIdeas[Math.floor(Math.random() * storyIdeas.length)];
    setPrompt(randomIdea);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[var(--color-dusk)] hover:text-[var(--color-twilight)] transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Stories
        </Link>
        <h1 className="text-3xl font-bold text-[var(--color-night)]">
          Create a New Story
        </h1>
        <p className="text-[var(--color-twilight)] mt-1">
          Describe your magical tale and we&apos;ll bring it to life
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Story Prompt */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <label className="label text-lg">What&apos;s your story about?</label>
            <button
              type="button"
              onClick={useIdeaSuggestion}
              className="text-sm text-[var(--color-lavender)] hover:text-[var(--color-dusk)] flex items-center gap-1"
            >
              <Wand2 className="w-4 h-4" />
              Inspire me
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A curious little bear who discovers a secret garden filled with talking flowers and makes friends with a shy butterfly..."
            className="textarea-field min-h-[140px]"
            required
          />
          <p className="text-sm text-[var(--color-dusk)] mt-2">
            Be creative! Include characters, settings, and any special elements you want.
          </p>
        </div>

        {/* Child's Name */}
        <div className="card">
          <label className="label text-lg mb-2">Personalize with a name (optional)</label>
          <input
            type="text"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="Emma"
            className="input-field"
          />
          <p className="text-sm text-[var(--color-dusk)] mt-2">
            Add your child&apos;s name to make them the hero of the story!
          </p>
        </div>

        {/* Age Group */}
        <div className="card">
          <label className="label text-lg mb-4">Select age group</label>
          <div className="grid sm:grid-cols-2 gap-3">
            {ageGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setAgeGroup(group.id)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  ageGroup === group.id
                    ? "border-[var(--color-lavender)] bg-[var(--color-lavender)]/5"
                    : "border-[var(--color-moonlight)] hover:border-[var(--color-lavender)]/50"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      ageGroup === group.id
                        ? "bg-[var(--color-lavender)] text-white"
                        : "bg-[var(--color-moonlight)] text-[var(--color-dusk)]"
                    }`}
                  >
                    <group.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--color-night)]">{group.label}</p>
                    <p className="text-sm text-[var(--color-dusk)]">{group.age}</p>
                  </div>
                </div>
                <p className="text-sm text-[var(--color-twilight)]">{group.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Voice Selection */}
        <div className="card">
          <label className="label text-lg mb-4">Choose narrator voice</label>
          {loadingVoices ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--color-lavender)]" />
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setVoiceId("")}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                  voiceId === ""
                    ? "border-[var(--color-lavender)] bg-[var(--color-lavender)]/5"
                    : "border-[var(--color-moonlight)] hover:border-[var(--color-lavender)]/50"
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    voiceId === ""
                      ? "bg-[var(--color-lavender)] text-white"
                      : "bg-[var(--color-moonlight)] text-[var(--color-dusk)]"
                  }`}
                >
                  <Mic className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold text-[var(--color-night)]">Default Voice</p>
                  <p className="text-sm text-[var(--color-dusk)]">Professional narrator voice</p>
                </div>
              </button>

              {voices.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => setVoiceId(voice.id)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                    voiceId === voice.id
                      ? "border-[var(--color-coral)] bg-[var(--color-coral)]/5"
                      : "border-[var(--color-moonlight)] hover:border-[var(--color-coral)]/50"
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      voiceId === voice.id
                        ? "bg-[var(--color-coral)] text-white"
                        : "bg-[var(--color-moonlight)] text-[var(--color-dusk)]"
                    }`}
                  >
                    <Mic className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--color-night)]">{voice.name}</p>
                    <p className="text-sm text-[var(--color-dusk)]">Your cloned voice</p>
                  </div>
                </button>
              ))}

              {voices.length === 0 && (
                <Link
                  href="/voices"
                  className="block p-4 rounded-xl border-2 border-dashed border-[var(--color-moonlight)] text-center hover:border-[var(--color-lavender)] transition-colors"
                >
                  <Mic className="w-8 h-8 mx-auto text-[var(--color-dusk)] mb-2" />
                  <p className="font-semibold text-[var(--color-twilight)]">Add Your Voice</p>
                  <p className="text-sm text-[var(--color-dusk)]">Clone your voice for personalized narration</p>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || prompt.length < 10}
          className="btn-golden w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating your story...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Create Story
            </>
          )}
        </button>
      </form>
    </div>
  );
}

