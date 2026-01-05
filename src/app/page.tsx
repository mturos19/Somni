"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Moon, Sparkles, Mic, BookOpen, Heart, Play, Star, ArrowRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { motion } from "framer-motion";

export default function Home() {
  const { status } = useSession();

  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-20 left-10 w-20 h-20 rounded-full bg-[var(--color-golden)] opacity-20 blur-2xl" />
        <div className="absolute top-40 right-20 w-32 h-32 rounded-full bg-[var(--color-coral)] opacity-20 blur-2xl" />
        <div className="absolute bottom-20 left-1/4 w-24 h-24 rounded-full bg-[var(--color-mint)] opacity-20 blur-2xl" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-full px-4 py-2 mb-6 border border-[var(--color-moonlight)]">
                <Sparkles className="w-4 h-4 text-[var(--color-golden)]" />
                <span className="text-sm font-medium text-[var(--color-twilight)]">
                  AI-Powered Storytelling
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[var(--color-night)] leading-tight mb-6">
                Bedtime Stories{" "}
                <span className="bg-gradient-to-r from-[var(--color-lavender)] to-[var(--color-coral)] bg-clip-text text-transparent">
                  in Mom&apos;s Voice
                </span>
              </h1>

              <p className="text-lg text-[var(--color-twilight)] mb-8 leading-relaxed max-w-xl">
                Create magical, personalized children&apos;s stories with AI, then hear them
                narrated in your own voice. Perfect for when you can&apos;t be there for
                bedtime.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href={status === "authenticated" ? "/create" : "/register"}
                  className="btn-golden flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-5 h-5" />
                  Create Your First Story
                </Link>
                <Link
                  href="#how-it-works"
                  className="btn-secondary flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  See How It Works
                </Link>
              </div>

              <div className="flex items-center gap-6 mt-10">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-lavender)] to-[var(--color-dusk)] border-2 border-white flex items-center justify-center"
                    >
                      <Star className="w-4 h-4 text-white" />
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className="w-4 h-4 text-[var(--color-golden)] fill-current" />
                    ))}
                  </div>
                  <p className="text-sm text-[var(--color-dusk)]">Loved by 2,000+ families</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="relative bg-gradient-to-br from-[var(--color-twilight)] to-[var(--color-night)] rounded-3xl p-8 shadow-2xl">
                {/* Moon decoration */}
                <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br from-[var(--color-golden)] to-[var(--color-coral)] float-animation opacity-90" />
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                      <Moon className="w-6 h-6 text-[var(--color-moonlight)]" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">Tonight&apos;s Story</h3>
                      <p className="text-[var(--color-moonlight)] text-sm">The Brave Little Star</p>
                    </div>
                  </div>

                  <div className="bg-white/5 rounded-2xl p-5 mb-4">
                    <p className="story-text text-[var(--color-stardust)] text-base leading-relaxed">
                      &ldquo;Once upon a time, in a sky full of twinkling lights, there lived a
                      little star named Luna who dreamed of adventures beyond the clouds...&rdquo;
                    </p>
                  </div>

                  {/* Audio waveform visualization */}
                  <div className="flex items-center gap-3">
                    <button className="w-12 h-12 rounded-full bg-[var(--color-golden)] flex items-center justify-center hover:scale-105 transition-transform">
                      <Play className="w-5 h-5 text-[var(--color-night)] ml-0.5" />
                    </button>
                    <div className="flex-1 flex items-center gap-1">
                      {[...Array(30)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-[var(--color-lavender)] rounded-full"
                          style={{
                            height: `${Math.random() * 20 + 10}px`,
                            opacity: 0.5 + Math.random() * 0.5,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[var(--color-moonlight)] text-sm">4:32</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="how-it-works" className="py-20 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-[var(--color-night)] mb-4">
              How the Magic Works
            </h2>
            <p className="text-lg text-[var(--color-twilight)] max-w-2xl mx-auto">
              Three simple steps to create unforgettable bedtime moments
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Sparkles,
                title: "Dream Up a Story",
                description:
                  "Tell us what kind of adventure you want. A dragon who loves cookies? A princess who codes? We'll create it!",
                color: "var(--color-lavender)",
                step: "01",
              },
              {
                icon: Mic,
                title: "Clone Your Voice",
                description:
                  "Record a short sample of your voice. Our AI learns how you speak to recreate your warm, familiar tone.",
                color: "var(--color-coral)",
                step: "02",
              },
              {
                icon: Heart,
                title: "Share the Magic",
                description:
                  "Play the story anytime - during bedtime, travel, or when you're apart. Your voice, their smile.",
                color: "var(--color-mint)",
                step: "03",
              },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="card relative overflow-hidden group"
              >
                <div
                  className="absolute top-0 right-0 text-8xl font-bold opacity-5 -mr-4 -mt-4"
                  style={{ color: feature.color }}
                >
                  {feature.step}
                </div>
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                  style={{ backgroundColor: `${feature.color}20` }}
                >
                  <feature.icon className="w-7 h-7" style={{ color: feature.color }} />
                </div>
                <h3 className="text-xl font-bold text-[var(--color-night)] mb-3">
                  {feature.title}
                </h3>
                <p className="text-[var(--color-twilight)] leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Story Examples */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-[var(--color-night)] mb-4">
              Stories Waiting to Be Told
            </h2>
            <p className="text-lg text-[var(--color-twilight)] max-w-2xl mx-auto">
              From gentle lullabies to grand adventures - create any story you can imagine
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: "The Sleepy Dragon", age: "3-5 yrs", emoji: "🐉", color: "#ff8fa3" },
              { title: "Space Bunny Adventures", age: "5-7 yrs", emoji: "🐰", color: "#7dd3c0" },
              { title: "The Magical Garden", age: "3-5 yrs", emoji: "🌸", color: "#ffd166" },
              { title: "Ocean Friends", age: "1-3 yrs", emoji: "🐙", color: "#9b8dc7" },
            ].map((story, index) => (
              <motion.div
                key={story.title}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer border border-[var(--color-moonlight)]"
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
                  style={{ backgroundColor: `${story.color}20` }}
                >
                  {story.emoji}
                </div>
                <h3 className="font-bold text-[var(--color-night)] mb-1">{story.title}</h3>
                <p className="text-sm text-[var(--color-dusk)]">{story.age}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative bg-gradient-to-br from-[var(--color-twilight)] to-[var(--color-night)] rounded-3xl p-10 sm:p-16 text-center overflow-hidden"
          >
            {/* Decorative stars */}
            <div className="absolute inset-0 opacity-30">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1 h-1 bg-white rounded-full"
                  style={{
                    top: `${Math.random() * 100}%`,
                    left: `${Math.random() * 100}%`,
                    opacity: Math.random() * 0.8 + 0.2,
                  }}
                />
              ))}
            </div>

            <div className="relative z-10">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--color-golden)] to-[var(--color-coral)] mx-auto mb-8 flex items-center justify-center float-animation">
                <Moon className="w-10 h-10 text-white" />
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Start Creating Magical Moments
              </h2>
              <p className="text-[var(--color-moonlight)] text-lg mb-8 max-w-xl mx-auto">
                Join thousands of parents creating personalized bedtime stories that their
                children will treasure forever.
              </p>

              <Link
                href={status === "authenticated" ? "/create" : "/register"}
                className="btn-golden inline-flex items-center gap-2"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white/50 border-t border-[var(--color-moonlight)] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-lavender)] to-[var(--color-dusk)] flex items-center justify-center">
                <Moon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-[var(--color-night)]">Somni</span>
            </div>

            <div className="flex items-center gap-6 text-sm text-[var(--color-twilight)]">
              <Link href="/privacy" className="hover:text-[var(--color-dusk)]">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-[var(--color-dusk)]">
                Terms
              </Link>
              <Link href="/contact" className="hover:text-[var(--color-dusk)]">
                Contact
              </Link>
            </div>

            <p className="text-sm text-[var(--color-dusk)]">
              © {new Date().getFullYear()} Somni. Made with 💜 for families.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
