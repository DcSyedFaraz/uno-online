import type { MetadataRoute } from "next";
import { BRAND } from "@/brand";

/** Installed to the home screen (Android), the game opens fullscreen and sideways. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#a3121c",
    theme_color: "#a3121c",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
