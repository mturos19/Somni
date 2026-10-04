import type { MetadataRoute } from "next";

/**
 * What a phone needs to treat Somni as an installed app rather than a page.
 *
 * `id` is pinned to "/" deliberately. Browsers identify an installed app by
 * `id`, falling back to `start_url` when it is absent - so without this, a
 * later `start_url: "/?source=pwa"` for launch tracking would read as a
 * different app entirely: every parent who had installed Somni would be
 * prompted again and end up with two icons. Pinning it now means `start_url`
 * stays free to change.
 *
 * The colours are Moonlit's, which is also the `:root` fallback palette in
 * globals.css. A manifest cannot follow the in-app theme picker - the splash
 * screen and the task-switcher chrome are fixed at install time - so it
 * matches the one palette the app can be sure it starts on.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Somni - bedtime stories in your voice",
    short_name: "Somni",
    description:
      "A brand-new bedtime story every night, tuned to your child's age and read aloud in your own voice.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#100a26",
    theme_color: "#100a26",
    lang: "en",
    dir: "ltr",
    categories: ["books", "education", "entertainment", "lifestyle"],
    icons: [
      // `any` is used wherever the icon is shown unmasked - the task switcher,
      // the install dialog, a desktop shortcut.
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // `maskable` art keeps the moon inside the safe circle, so Android crops
      // it to the launcher's shape instead of putting the square in a white box.
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    /**
     * Points at this same app, which is what lets `getInstalledRelatedApps()`
     * report that Somni is already installed when the parent happens to open it
     * in a browser tab instead. Without the self-reference that call always
     * returns an empty list, and the install card nags someone who already has
     * the icon on their home screen.
     */
    related_applications: [
      { platform: "webapp", url: "/manifest.webmanifest", id: "/" },
    ],
  };
}
