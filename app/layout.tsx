import type { Metadata } from "next";
import { WebMCPProvider } from "@/components/webmcp/webmcp-provider";
import { AgentActivity } from "@/components/webmcp/agent-activity";
import { ComparePanel } from "@/components/products/compare-panel";
import "./globals.css";

export const metadata: Metadata = {
  title: "Procura — Modern procurement",
  description: "A modern procurement marketplace for workplace purchasing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <WebMCPProvider />
        <AgentActivity />
        <ComparePanel />
        {children}
      </body>
    </html>
  );
}
