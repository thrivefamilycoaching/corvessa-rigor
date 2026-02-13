import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D9488",
          borderRadius: "36px",
          fontFamily: "sans-serif",
        }}
      >
        <span style={{ color: "white", fontSize: 72, fontWeight: 800, letterSpacing: "-2px" }}>
          MSL
        </span>
      </div>
    ),
    { ...size }
  );
}
