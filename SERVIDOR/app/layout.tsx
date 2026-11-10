import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Pisada",
    description: "Catálogo y administración de Pisada.",
    icons: {
        icon: "/favicon.svg",
        shortcut: "/favicon.svg",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es">
            <body className="antialiased">{children}</body>
        </html>
    );
}
