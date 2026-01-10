import { SessionProvider } from "@/components/auth/session-provider";
import { ModalProvider } from "@/components/layout/modal-context";
import { QueryClientProvider } from "@/components/layout/query-client-provider";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SettingsModal } from "@/components/auth/settings-modal";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const departureMono = localFont({
  src: "./fonts/DepartureMono-Regular.woff2",
  variable: "--font-departure-mono",
});

export const metadata: Metadata = {
  title: "Maru",
  description:
    "An open-source background agent and web interface to build, debug, and understand code.",
  icons: {
    icon: [
      {
        url: "/maru-black.svg",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/maru.svg",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${departureMono.variable} overscroll-none antialiased`}
      >
        <QueryClientProvider>
          <ThemeProvider
            attribute="class"
            forcedTheme="dark"
            disableTransitionOnChange
          >
            <SessionProvider>
              <ModalProvider>
                {/* SidebarProvider also provides a TooltipProvider inside */}
                <SidebarProvider defaultOpen={defaultOpen}>
                  {/* Don't render the sidebar here; we have individual layouts for route groups to render different variants of the sidebar */}
                  {children}
                  <SettingsModal />
                  <Toaster />
                </SidebarProvider>
              </ModalProvider>
            </SessionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
