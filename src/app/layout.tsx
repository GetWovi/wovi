import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { LOGO_FILES } from "@/components/brand/Logo";
import { ToastProvider } from "@/components/ui/Toast";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  /* Share previews need absolute image URLs: the live address, never localhost. */
  metadataBase: new URL(process.env.WOVI_APP_URL || SITE_URL),
  title: {
    default: "WOVI",
    template: "%s | WOVI",
  },
  description: "AI agents for content. One agent, one job. Each agent reads your Brand Brain first and hands you work that sounds like you.",
  icons: {
    icon: [
      { url: LOGO_FILES.favicon, type: "image/png", sizes: "48x48" },
      { url: LOGO_FILES.ico, sizes: "32x32 16x16" },
    ],
    apple: [{ url: LOGO_FILES.appIcon192, sizes: "192x192" }],
  },
  openGraph: {
    title: "WOVI",
    description: "AI agents for content. One agent, one job.",
    images: [{ url: LOGO_FILES.ogBanner, width: 1200, height: 630 }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B1230" },
    { media: "(prefers-color-scheme: light)", color: "#FFF4DC" },
  ],
};

/* Runs before paint: apply the saved theme, or the system one, without a flash. */
const themeScript = `(function(){try{var t=localStorage.getItem("wovi-theme");if(t!=="light"&&t!=="night"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"night"}document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","night")}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={outfit.variable} data-theme="night" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
