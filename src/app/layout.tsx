import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Somni - Magical Bedtime Stories",
  description: "Create personalized children's stories and hear them in a loved one's voice. AI-powered storytelling meets voice cloning for magical bedtime moments.",
  keywords: ["children's stories", "bedtime stories", "AI stories", "voice cloning", "personalized stories"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <div className="stars-bg" aria-hidden="true" />
          <div className="relative z-10 min-h-screen">
            {children}
          </div>
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#2d2f4e',
                color: '#f5f3fa',
                borderRadius: '12px',
                padding: '16px',
                fontFamily: 'Quicksand, sans-serif',
              },
              success: {
                iconTheme: {
                  primary: '#7dd3c0',
                  secondary: '#f5f3fa',
                },
              },
              error: {
                iconTheme: {
                  primary: '#ff8fa3',
                  secondary: '#f5f3fa',
                },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
