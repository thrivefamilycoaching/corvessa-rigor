import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My School List",
  description: "Analyze course rigor, discover college recommendations, and generate professional narratives",
};

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
