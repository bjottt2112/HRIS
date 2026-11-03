import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "../lib/auth-context";

export const metadata: Metadata = {
  title: "Montreux HRIS",
  description: "Employee Directory & HR Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased selection:bg-rose-500 selection:text-white">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
