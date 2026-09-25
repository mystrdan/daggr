import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daggr — Domain Market Explorer",
  description: "Discover what is happening in the domain market.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}