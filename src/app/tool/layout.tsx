import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My School List | Tool",
  description: "Analyze course rigor, discover college recommendations",
};

export default function ToolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
