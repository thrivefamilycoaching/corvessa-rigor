import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My School List | Tool",
  description: "Upload your transcript and get personalized college recommendations with admission odds. Find your safety, match, and reach schools in minutes.",
};

export default function ToolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
