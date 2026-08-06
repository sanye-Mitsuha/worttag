import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Worttag · 德语词汇记忆";
const description = "以三档记忆判断、间隔复习和高质量语法例句，建立真正留得住的德语词汇。";
const themeScript = `(() => { try { const saved = JSON.parse(localStorage.getItem("worttag-settings-v1") || "{}"); const mode = ["light", "dark", "system"].includes(saved.theme) ? saved.theme : "system"; const layout = ["auto", "mobile", "desktop"].includes(saved.layoutMode) ? saved.layoutMode : "auto"; const resolved = mode === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode; document.documentElement.dataset.theme = resolved; document.documentElement.dataset.layout = layout; document.documentElement.style.colorScheme = resolved; } catch { const resolved = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; document.documentElement.dataset.theme = resolved; document.documentElement.dataset.layout = "auto"; document.documentElement.style.colorScheme = resolved; } })();`;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "zh_CN",
      images: [{ url: imageUrl, width: 1200, height: 686, alt: "Worttag 德语词汇记忆" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
