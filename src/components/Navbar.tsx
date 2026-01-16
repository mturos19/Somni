"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Moon, Menu, X, LogOut, User, BookOpen, Mic } from "lucide-react";
import { useState } from "react";

export function Navbar() {
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[var(--color-moonlight)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-lavender)] to-[var(--color-dusk)] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Moon className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-[var(--color-night)]">Somni</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {status === "authenticated" ? (
              <>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 text-[var(--color-twilight)] hover:text-[var(--color-dusk)] transition-colors font-medium"
                >
                  <BookOpen className="w-4 h-4" />
                  My Stories
                </Link>
                <Link
                  href="/voices"
                  className="flex items-center gap-2 text-[var(--color-twilight)] hover:text-[var(--color-dusk)] transition-colors font-medium"
                >
                  <Mic className="w-4 h-4" />
                  Voices
                </Link>
                <Link
                  href="/create"
                  className="btn-primary text-sm py-2 px-4"
                >
                  Create Story
                </Link>
                <div className="relative group">
                  <button className="flex items-center gap-2 text-[var(--color-twilight)] hover:text-[var(--color-dusk)] transition-colors">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-moonlight)] flex items-center justify-center">
                      <User className="w-4 h-4" />
                    </div>
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border border-[var(--color-moonlight)]">
                    <div className="p-3 border-b border-[var(--color-moonlight)]">
                      <p className="font-medium text-[var(--color-night)] truncate">
                        {session.user?.name || "User"}
                      </p>
                      <p className="text-sm text-[var(--color-dusk)] truncate">
                        {session.user?.email}
                      </p>
                    </div>
                    <button
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[var(--color-coral)] hover:bg-[var(--color-stardust)] transition-colors rounded-b-xl"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-[var(--color-twilight)] hover:text-[var(--color-dusk)] transition-colors font-medium"
                >
                  Sign In
                </Link>
                <Link href="/register" className="btn-primary text-sm py-2 px-4">
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-[var(--color-twilight)]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-[var(--color-moonlight)]">
          <div className="px-4 py-4 space-y-3">
            {status === "authenticated" ? (
              <>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-2 py-2 text-[var(--color-twilight)] font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <BookOpen className="w-4 h-4" />
                  My Stories
                </Link>
                <Link
                  href="/voices"
                  className="flex items-center gap-2 py-2 text-[var(--color-twilight)] font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Mic className="w-4 h-4" />
                  Voices
                </Link>
                <Link
                  href="/create"
                  className="block py-2 text-[var(--color-lavender)] font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Create Story
                </Link>
                <button
                  onClick={() => {
                    signOut({ callbackUrl: "/" });
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-2 py-2 text-[var(--color-coral)] font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="block py-2 text-[var(--color-twilight)] font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="block py-2 text-[var(--color-lavender)] font-medium"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

