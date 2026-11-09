import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Evidence · Product Discovery",
  description:
    "Turn customer conversations into opportunities backed by original evidence. $10/month. Bring your own AI API key.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
