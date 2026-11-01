import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ServiceWorkerManager } from "@/components/ServiceWorkerManager";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const title = "Somni - bedtime stories in your voice";
const description =
  "A brand-new bedtime story every night, tuned to your child's age and read aloud in your own voice.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Somni",
  // Next emits <link rel="manifest"> for app/manifest.ts on its own, but saying
  // so here keeps the URL explicit next to the rest of the install metadata.
  manifest: "/manifest.webmanifest",
  /**
   * `capable` is what makes an icon tapped on the iOS home screen open without
   * Safari's chrome. statusBarStyle stays at "default": "black-translucent"
   * would push the web view up under the clock and battery, and the masthead
   * is not laid out for that.
   */
  appleWebApp: {
    capable: true,
    title: "Somni",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "Somni",
    title,
    description,
    url: "/",
    locale: "en_GB",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Somni - a brand-new bedtime story every night, read aloud in your own voice.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
  // A single-screen app with nothing to crawl beyond the front door.
  alternates: { canonical: "/" },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#100a26",
  // Bedtime use is one-handed and half-asleep; stop double-tap zoom surprises.
  maximumScale: 5,
  /**
   * Required before env(safe-area-inset-*) resolves to anything but 0px. Once
   * installed there is no browser chrome, so the fixed controls would otherwise
   * sit in the home-indicator strip.
   */
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${nunito.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/*
          Chromium fires `beforeinstallprompt` as soon as it has validated the
          manifest and the worker - usually around load, and well before this
          app has hydrated, since the whole UI is one client component behind
          two font loads. It is never re-dispatched, so a listener added later
          in a useEffect simply misses it. Catching it here, before any
          Next.js module runs, is the difference between the install card
          appearing and never appearing at all.
        */}
        <Script id="somni-install-capture" strategy="beforeInteractive">
          {`window.__somniInstallEvent=null;addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__somniInstallEvent=e;},{capture:true});`}
        </Script>
        <ServiceWorkerManager />
        {children}
        {/*
          Field measurement, because nothing else in this project can see a real
          phone. Everything known about how Somni performs was measured in a
          headless browser on a desktop; what a four-year-old's parent actually
          has is a mid-range Android that has been awake for nine hours, and the
          cost of a backdrop-filter or an animated star is entirely a question
          about that device.

          Speed Insights reports Core Web Vitals from real sessions - INP above
          all, which is the one that answers "does tapping this feel slow".
          Analytics answers the only product question that matters before
          launch: whether anyone finishes a story, and whether the install card
          is ever accepted.

          Both are cookieless and collect no personal data, and both serve their
          script from this origin (/_vercel/*), so the Content-Security-Policy
          in next.config.ts needs nothing added for them.
        */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
