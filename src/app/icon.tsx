import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: "6px",
          fontFamily: "sans-serif",
        }}
      >
        <span style={{ color: "white", fontSize: 14, fontWeight: 800, letterSpacing: "-0.5px" }}>
          MSL
        </span>
      </div>
    ),
    { ...size }
  );
}
