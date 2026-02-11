import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Counselor Co-Pilot | My School List",
  description: "Analyze student course rigor, generate counselor narratives, and discover recommended colleges",
};

export default function CounselorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
