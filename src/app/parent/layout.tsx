import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "College Co-Pilot | Corvessa",
  description: "Analyze course rigor, discover college recommendations, and generate professional narratives",
};

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
