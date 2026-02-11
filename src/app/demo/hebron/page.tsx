"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const MAROON = "#7A1E2E";
const LIGHT = "#F3F4F6";

const SUGGESTIONS = [
  "Tell me about academics",
  "What sports do you offer?",
  "How do I apply?",
  "What is tuition?",
];

export default function HebronDemo() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Welcome to Hebron Christian Academy! \ud83e\udd81 I'm here to help you learn about our school. Whether you're interested in academics, athletics, admissions, or campus life \u2014 just ask! How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput("");
    setLoading(true);

    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);

    try {
      const res = await fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: "hebron",
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data?.reply || "Sorry \u2014 something went wrong. Please try again.";
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry \u2014 network error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const showSuggestions = messages.length === 1 && !loading;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        background: "#fff",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: MAROON,
          color: "#fff",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 36 }}>{"\ud83e\udd81"}</span>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>
            Hebron Christian Academy
          </h1>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.85, marginTop: 2 }}>
            AI Assistant &middot; Dacula, Georgia
          </p>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          background: "#fff",
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
            }}
          >
            <div
              style={{
                background: m.role === "user" ? MAROON : LIGHT,
                color: m.role === "user" ? "#fff" : "#1f2937",
                padding: "14px 18px",
                borderRadius: 20,
                borderBottomRightRadius: m.role === "user" ? 4 : 20,
                borderBottomLeftRadius: m.role === "assistant" ? 4 : 20,
                fontSize: 15,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "80%",
            }}
          >
            <div
              style={{
                background: LIGHT,
                color: "#9ca3af",
                padding: "14px 18px",
                borderRadius: 20,
                borderBottomLeftRadius: 4,
                fontSize: 15,
                fontStyle: "italic",
              }}
            >
              Typing...
            </div>
          </div>
        )}

        {/* Suggestion chips */}
        {showSuggestions && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 4,
            }}
          >
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  background: "#fff",
                  border: `1.5px solid ${MAROON}`,
                  color: MAROON,
                  padding: "10px 16px",
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = MAROON;
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                  e.currentTarget.style.color = MAROON;
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          padding: "16px",
          background: "#fff",
          flexShrink: 0,
        }}
      >
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask about admissions, academics, athletics..."
            style={{
              flex: 1,
              border: "1.5px solid #d1d5db",
              borderRadius: 12,
              padding: "14px 16px",
              fontSize: 15,
              outline: "none",
              background: "#fafafa",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = MAROON)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
          />
          <button
            onClick={() => send(input)}
            disabled={loading}
            style={{
              background: MAROON,
              color: "#fff",
              border: "none",
              borderRadius: 12,
              padding: "0 24px",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            Send
          </button>
        </div>
        <p
          style={{
            textAlign: "center",
            fontSize: 11,
            color: "#9ca3af",
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          Powered by Corvessa Partners
        </p>
      </div>
    </div>
  );
}
