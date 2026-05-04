import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { Analytics } from "@vercel/analytics/react";

// ─── Environment Configuration ─────────────────────────────────────────────
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Safety check to verify .env connection
if (!ADMIN_PASSWORD || !CLOUD_NAME || !UPLOAD_PRESET) {
  console.warn("⚠️ Configuration Missing: Check your .env file!");
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("⚠️ Supabase Configuration Missing: Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file!");
}

// ─── Supabase Client ────────────────────────────────────────────────────────
// Initialised once at module level — safe to share across all components.
// The anon key is intentionally public: Row Level Security (RLS) in Supabase
// controls what this key can actually do (see supabase-schema.sql).
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Aesthetic: Industrial Luxury ───────────────────────────────────────────
// Raw concrete textures meet brushed-gold accents. Heavy serif display type
// against tight monospace labels. Think "architect's journal meets luxury real estate".


const DEMO_ENTRIES = [
  {
    id: "demo-1",
    date: "2026-04-23",
    label: "Foundation Poured",
    note: "Concrete foundation completed. Ready for framing.",
    imageUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80",
    fileName: "foundation_apr23.jpg",
  },
  {
    id: "demo-2",
    date: "2026-04-09",
    label: "Site Cleared",
    note: "Land cleared and levelled. Excavation begins next week.",
    imageUrl: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&q=80",
    fileName: "site_cleared_apr09.jpg",
  },
  {
    id: "demo-3",
    date: "2026-03-26",
    label: "Permits Approved",
    note: "All municipal permits approved. Breaking ground soon.",
    imageUrl: "https://images.unsplash.com/photo-1590725140246-20acddc1ec6d?w=800&q=80",
    fileName: "permits_mar26.jpg",
  },
];

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getDayOfWeek(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "long" });
}

function getWeekNumber(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
}

// ─── Supabase Data Helpers ────────────────────────────────────────────────────

// loadEntries: fetches all rows from the `entries` table, newest date first.
// Falls back to DEMO_ENTRIES only if the table is completely empty (first run).
async function loadEntries() {
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("Supabase loadEntries error:", error.message);
    throw error; // caller handles this — shows dbError banner
  }

  // On a brand-new install the table is empty; seed with demo data so the
  // timeline doesn't look blank. Remove this block once you've added real entries.
  if (!data || data.length === 0) return [];
  return data;
}

// syncEntry: upserts a single entry (insert on new id, update on existing id).
// Used by both handleAdd (new Cloudinary upload) and handleUpdate (inline edit).
async function syncEntry(entry) {
  const { error } = await supabase
    .from("entries")
    .upsert(entry, { onConflict: "id" });

  if (error) {
    console.error("Supabase syncEntry error:", error.message);
    throw error;
  }
}

// deleteEntry: removes a single row by its text id.
async function deleteEntry(id) {
  const { error } = await supabase
    .from("entries")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Supabase deleteEntry error:", error.message);
    throw error;
  }
}

// ─── Component: ImageCard ────────────────────────────────────────────────────

function ImageCard({ entry, index, isFirst, isAdmin, onDelete, onOpenLightbox, onUpdate }) {
  const [loaded, setLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [imgHovered, setImgHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Edit mode state ────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({ date: entry.date, label: entry.label || "", note: entry.note || "" });

  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  // If the entry prop changes from outside (e.g. after handleUpdate), sync draft
  useEffect(() => {
    if (!isEditing) {
      setDraft({ date: entry.date, label: entry.label || "", note: entry.note || "" });
    }
  }, [entry, isEditing]);

  const handleDownload = async () => {
    try {
      const response = await fetch(entry.imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.fileName || `construction_${entry.date}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(entry.imageUrl, "_blank");
    }
  };

  // SHARE — copies imageUrl to clipboard.
  // Once you're on Cloudinary, entry.imageUrl is already a public https:// CDN URL.
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(entry.imageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copy this link:", entry.imageUrl);
    }
  };

  const handleEditSave = () => {
    if (!draft.date) return;
    onUpdate({ ...entry, date: draft.date, label: draft.label, note: draft.note });
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setDraft({ date: entry.date, label: entry.label || "", note: entry.note || "" });
    setIsEditing(false);
  };

  // Shared input style for edit mode fields
  const editInputStyle = {
    background: "var(--concrete-dark)",
    border: "1px solid var(--concrete-light)",
    borderRadius: "2px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    padding: "7px 10px",
    outline: "none",
    width: "100%",
    letterSpacing: "0.04em",
    boxSizing: "border-box",
  };

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: `opacity 0.7s ease ${index * 0.12}s, transform 0.7s ease ${index * 0.12}s`,
      }}
    >
      <div style={{ display: "flex", gap: "28px", alignItems: "flex-start" }}>
        {/* Left: Timeline column */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: "56px" }}>
          <div style={{
            background: isFirst ? "var(--gold)" : "var(--concrete-mid)",
            color: isFirst ? "var(--ink)" : "var(--dust)",
            fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.12em",
            padding: "3px 6px", borderRadius: "2px", fontWeight: 700,
            whiteSpace: "nowrap", marginBottom: "8px",
          }}>
            WK {getWeekNumber(isEditing ? draft.date : entry.date)}
          </div>
          <div style={{
            width: isFirst ? "20px" : "12px", height: isFirst ? "20px" : "12px",
            borderRadius: "50%",
            background: isEditing ? "var(--gold)" : (isFirst ? "var(--gold)" : "var(--concrete-mid)"),
            border: isFirst ? "3px solid var(--gold-light)" : "2px solid var(--concrete-light)",
            boxShadow: isFirst ? "0 0 16px var(--gold-glow)" : "none",
            flexShrink: 0, zIndex: 2, position: "relative",
          }} />
          <div style={{
            width: "2px", flexGrow: 1, minHeight: "40px",
            background: "linear-gradient(to bottom, var(--concrete-mid), transparent)",
            marginTop: "4px",
          }} />
        </div>

        {/* Right: Card */}
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            flex: 1,
            background: "var(--card-bg)",
            border: `1px solid ${isEditing ? "var(--gold)" : hovered ? "var(--gold)" : "var(--border)"}`,
            borderRadius: "4px",
            overflow: "hidden",
            transition: "border-color 0.3s, box-shadow 0.3s, transform 0.3s",
            transform: !isEditing && hovered ? "translateY(-3px)" : "none",
            boxShadow: isEditing
              ? "0 0 0 1px var(--gold), 0 20px 60px rgba(201,168,76,0.12)"
              : hovered
                ? "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px var(--gold)"
                : "0 4px 20px rgba(0,0,0,0.3)",
            marginBottom: "40px",
          }}
        >
          {/* ── Card Header ── */}
          <div style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: isEditing ? "flex-start" : "center",
            background: isEditing ? "rgba(201,168,76,0.04)" : "var(--card-header)",
            gap: "16px",
            flexWrap: "wrap",
          }}>

            {/* ── VIEW MODE: static date/label ── */}
            {!isEditing ? (
              <div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.15em",
                  color: "var(--gold)", textTransform: "uppercase", marginBottom: "3px",
                }}>
                  {getDayOfWeek(entry.date)}
                </div>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: "clamp(16px, 2.5vw, 22px)",
                  color: "var(--text-primary)", fontWeight: 700, letterSpacing: "-0.01em",
                }}>
                  {formatDate(entry.date)}
                </div>
                {entry.label && (
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--dust)",
                    marginTop: "4px", letterSpacing: "0.08em",
                  }}>
                    {entry.label.toUpperCase()}
                  </div>
                )}
              </div>
            ) : (
              /* ── EDIT MODE: editable fields ── */
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1, minWidth: "200px" }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.18em",
                  color: "var(--gold)", marginBottom: "2px",
                }}>
                  ◆ EDITING ENTRY
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", color: "var(--dust)", marginBottom: "4px" }}>DATE</div>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
                    style={editInputStyle}
                  />
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", color: "var(--dust)", marginBottom: "4px" }}>MILESTONE LABEL</div>
                  <input
                    type="text"
                    value={draft.label}
                    placeholder="e.g. Roof Framing Complete"
                    onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                    style={editInputStyle}
                  />
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", color: "var(--dust)", marginBottom: "4px" }}>NOTE</div>
                  <textarea
                    value={draft.note}
                    placeholder="Brief description of this week's progress..."
                    onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
                    style={{ ...editInputStyle, height: "64px", resize: "vertical" }}
                  />
                </div>
              </div>
            )}

            {/* ── Button group ── */}
            <div style={{ display: "flex", gap: "8px", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "flex-start" }}>
              {!isEditing ? (
                /* VIEW MODE buttons: SAVE, SHARE, EDIT (admin), DELETE (admin) */
                <>
                  <button onClick={handleDownload} title="Download image" style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    background: hovered ? "var(--gold)" : "transparent",
                    border: `1px solid ${hovered ? "var(--gold)" : "var(--concrete-mid)"}`,
                    color: hovered ? "var(--ink)" : "var(--dust)",
                    fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em",
                    padding: "8px 14px", borderRadius: "2px", cursor: "pointer",
                    transition: "all 0.25s", fontWeight: 600,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    SAVE
                  </button>

                  <button onClick={handleShare} title="Copy link to clipboard" style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    background: copied ? "var(--concrete-mid)" : "transparent",
                    border: `1px solid ${copied ? "var(--gold)" : "var(--concrete-mid)"}`,
                    color: copied ? "var(--gold)" : "var(--dust)",
                    fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em",
                    padding: "8px 14px", borderRadius: "2px", cursor: "pointer",
                    transition: "all 0.25s", fontWeight: 600, whiteSpace: "nowrap", minWidth: "80px",
                  }}
                    onMouseEnter={e => { if (!copied) { e.currentTarget.style.borderColor = "var(--dust)"; e.currentTarget.style.color = "var(--text-primary)"; } }}
                    onMouseLeave={e => { if (!copied) { e.currentTarget.style.borderColor = "var(--concrete-mid)"; e.currentTarget.style.color = "var(--dust)"; } }}
                  >
                    {copied ? (
                      <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>COPIED!</>
                    ) : (
                      <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>SHARE</>
                    )}
                  </button>

                  {/* EDIT — admin only */}
                  {isAdmin && (
                    <button onClick={() => setIsEditing(true)} title="Edit entry" style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      background: "transparent",
                      border: "1px solid var(--concrete-mid)",
                      color: "var(--dust)",
                      fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em",
                      padding: "8px 14px", borderRadius: "2px", cursor: "pointer",
                      transition: "all 0.25s", fontWeight: 600,
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.color = "var(--gold)"; e.currentTarget.style.background = "rgba(201,168,76,0.06)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--concrete-mid)"; e.currentTarget.style.color = "var(--dust)"; e.currentTarget.style.background = "transparent"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      EDIT
                    </button>
                  )}

                  {/* DELETE — admin only */}
                  {isAdmin && (
                    <button onClick={() => onDelete(entry.id)} title="Delete entry" style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      background: "transparent", border: "1px solid #5a1a1a", color: "#a04040",
                      fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em",
                      padding: "8px 14px", borderRadius: "2px", cursor: "pointer",
                      transition: "all 0.25s", fontWeight: 600,
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#7a1a1a"; e.currentTarget.style.borderColor = "#c0392b"; e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#5a1a1a"; e.currentTarget.style.color = "#a04040"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                      DELETE
                    </button>
                  )}
                </>
              ) : (
                /* EDIT MODE buttons: UPDATE (gold) + CANCEL (subtle) */
                <>
                  <button onClick={handleEditSave} disabled={!draft.date} title="Save changes" style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    background: draft.date ? "var(--gold)" : "var(--concrete-mid)",
                    border: `1px solid ${draft.date ? "var(--gold)" : "var(--concrete-mid)"}`,
                    color: draft.date ? "var(--ink)" : "var(--dust)",
                    fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em",
                    padding: "8px 16px", borderRadius: "2px", cursor: draft.date ? "pointer" : "not-allowed",
                    transition: "all 0.25s", fontWeight: 700,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    UPDATE
                  </button>
                  <button onClick={handleEditCancel} title="Discard changes" style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    background: "transparent", border: "1px solid var(--concrete-light)", color: "var(--dust)",
                    fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em",
                    padding: "8px 14px", borderRadius: "2px", cursor: "pointer",
                    transition: "all 0.25s", fontWeight: 600,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--dust)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--concrete-light)"; e.currentTarget.style.color = "var(--dust)"; }}
                  >
                    CANCEL
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Image — click to open lightbox (disabled in edit mode) */}
          <div
            onClick={() => !isEditing && loaded && onOpenLightbox(entry)}
            onMouseEnter={() => !isEditing && setImgHovered(true)}
            onMouseLeave={() => setImgHovered(false)}
            style={{
              position: "relative", background: "var(--concrete-dark)",
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: "200px",
              cursor: isEditing ? "default" : (loaded ? "zoom-in" : "default"),
              opacity: isEditing ? 0.6 : 1,
              transition: "opacity 0.3s",
            }}
          >
            {!loaded && (
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(110deg, var(--concrete-dark) 30%, var(--concrete-mid) 50%, var(--concrete-dark) 70%)",
                backgroundSize: "200% 100%", animation: "shimmer 1.8s infinite", minHeight: "200px",
              }} />
            )}
            <img
              src={entry.imageUrl}
              alt={`Construction on ${formatDate(entry.date)}`}
              onLoad={() => setLoaded(true)}
              style={{
                width: "100%", height: "auto", maxHeight: "70vh", objectFit: "contain",
                display: "block", opacity: loaded ? 1 : 0, transition: "opacity 0.5s",
                userSelect: "none", pointerEvents: "none",
              }}
            />

            {/* Hover hint overlay — hidden in edit mode */}
            {!isEditing && loaded && imgHovered && (
              <div style={{
                position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
                pointerEvents: "none",
              }}>
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
                  background: "rgba(13,13,13,0.75)", border: "1px solid var(--gold)",
                  borderRadius: "4px", padding: "14px 22px", backdropFilter: "blur(4px)",
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.8">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                  </svg>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.18em", color: "var(--gold)" }}>
                    CLICK TO ZOOM
                  </span>
                </div>
              </div>
            )}

            {/* Edit mode overlay label */}
            {isEditing && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                pointerEvents: "none",
              }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.18em",
                  color: "var(--dust)", border: "1px dashed var(--concrete-light)",
                  borderRadius: "2px", padding: "6px 14px", background: "rgba(13,13,13,0.6)",
                }}>
                  IMAGE CANNOT BE REPLACED — UPLOAD NEW ENTRY TO CHANGE PHOTO
                </div>
              </div>
            )}

            {/* "LATEST" ribbon */}
            {isFirst && !isEditing && (
              <div style={{
                position: "absolute", top: "16px", left: "0",
                background: "var(--gold)", color: "var(--ink)",
                fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 800,
                letterSpacing: "0.18em", padding: "5px 14px 5px 10px",
                clipPath: "polygon(0 0, 100% 0, 88% 100%, 0 100%)",
                pointerEvents: "none",
              }}>
                ◆ LATEST
              </div>
            )}
          </div>

          {/* Note — hidden in edit mode (editing happens in header fields) */}
          {!isEditing && entry.note && (
            <div style={{
              padding: "14px 20px", borderTop: "1px solid var(--border)",
              fontFamily: "var(--font-body)", fontSize: "13px",
              color: "var(--dust)", lineHeight: 1.6, fontStyle: "italic",
            }}>
              "{entry.note}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



function Lightbox({ entry, onClose }) {
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const imgRef = useRef(null);

  // Close on Esc
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleImgClick = (e) => {
    e.stopPropagation();
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    // Capture click position as % within the image — becomes the zoom origin
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (zoom) {
      setZoom(false);
    } else {
      setOrigin({ x, y });
      setZoom(true);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(5,5,5,0.96)",
        backdropFilter: "blur(10px)",
        display: "flex", flexDirection: "column",
        animation: "backdropIn 0.22s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Top bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
        background: "rgba(13,13,13,0.9)",
        flexShrink: 0, zIndex: 1,
      }}>
        <div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "9px",
            letterSpacing: "0.2em", color: "var(--gold)", marginBottom: "2px",
          }}>
            ◆ {getDayOfWeek(entry.date).toUpperCase()} · WK {getWeekNumber(entry.date)}
          </div>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(15px, 2vw, 20px)",
            fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em",
          }}>
            {formatDate(entry.date)}
            {entry.label && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--dust)",
                marginLeft: "12px", fontWeight: 400, letterSpacing: "0.06em",
              }}>
                {entry.label.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {/* Zoom state hint */}
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em",
            color: "var(--dust)", border: "1px solid var(--border)",
            borderRadius: "20px", padding: "5px 12px",
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              {!zoom && <line x1="11" y1="8" x2="11" y2="14"/>}
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            {zoom ? "CLICK TO FIT" : "CLICK TO ZOOM"}
          </div>

          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              width: "36px", height: "36px",
              background: "transparent", border: "1px solid var(--concrete-mid)",
              borderRadius: "2px", color: "var(--dust)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s", fontSize: "16px",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.color = "var(--gold)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--concrete-mid)"; e.currentTarget.style.color = "var(--dust)"; }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Image stage */}
      <div
        onClick={() => zoom && setZoom(false)}
        style={{
          flex: 1, overflow: zoom ? "auto" : "hidden",
          display: "flex",
          alignItems: zoom ? "flex-start" : "center",
          justifyContent: zoom ? "flex-start" : "center",
          padding: zoom ? "0" : "24px",
          cursor: zoom ? "zoom-out" : "zoom-in",
        }}
      >
        <img
          ref={imgRef}
          src={entry.imageUrl}
          alt={`Construction on ${formatDate(entry.date)}`}
          onClick={handleImgClick}
          draggable={false}
          style={{
            display: "block",
            // 2.5× zoom: expands to 250% of viewport width for clear detail inspection
            width: zoom ? "250vw" : "auto",
            maxWidth: zoom ? "none" : "100%",
            maxHeight: zoom ? "none" : "calc(100vh - 120px)",
            height: "auto",
            objectFit: "contain",
            cursor: zoom ? "zoom-out" : "zoom-in",
            transition: "width 0.35s cubic-bezier(0.4,0,0.2,1)",
            userSelect: "none",
          }}
        />
      </div>

      {/* Bottom caption */}
      {entry.note && (
        <div style={{
          padding: "12px 24px",
          borderTop: "1px solid var(--border)",
          background: "rgba(13,13,13,0.9)",
          fontFamily: "var(--font-body)", fontSize: "13px",
          color: "var(--dust)", fontStyle: "italic", flexShrink: 0,
        }}>
          "{entry.note}"
        </div>
      )}
    </div>
  );
}

// ─── Component: AdminPanel ───────────────────────────────────────────────────



function AdminPanel({ onAdd, onLogin, onClose, isAdmin }) {
  // If the parent already knows the user is admin (e.g. authenticated earlier
  // this session), skip straight to the upload form — no re-entry needed.
  const [authed, setAuthed] = useState(isAdmin === true);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState(false);
  const [form, setForm] = useState({ date: "", label: "", note: "", imageUrl: "", fileName: "" });
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Tracks the Cloudinary upload pipeline:
  //  "idle"      — no file selected yet
  //  "uploading" — fetch() POST in progress
  //  "done"      — secure_url received, ready to save entry
  //  "error"     — upload failed, message in uploadError
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0); // 0–100 simulated
  const fileRef = useRef(null);

  // ─── Cloudinary config ────────────────────────────────────────────────────
  // Values are read from Vite environment variables so no secrets live in code.
  // Create a `.env` file in your project root (never commit it):
  //   VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
  //   VITE_CLOUDINARY_UPLOAD_PRESET=your_unsigned_preset

  // ─────────────────────────────────────────────────────────────────────────

  const tryLogin = () => {
    if (pw === ADMIN_PASSWORD) { setAuthed(true); setPwError(false); onLogin(); }
    else { setPwError(true); setPw(""); }
  };

  // handleFile: generate a local object-URL for the preview thumbnail only.
  // The actual upload to Cloudinary happens later in handleSubmit so the user
  // can still edit the date/label/note before committing the network request.
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Store the raw File object in a ref so handleSubmit can read it
    fileRef._selectedFile = file;
    // Revoke any previous preview URL to avoid memory leaks
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setForm(f => ({ ...f, imageUrl: "", fileName: file.name }));
    setUploadStatus("idle");
    setUploadError("");
  };

  // handleSubmit: POST the file to Cloudinary, then save only the returned
  // secure_url into the entry — no base64 ever touches localStorage.
  const handleSubmit = async () => {
    if (!form.date || !fileRef._selectedFile) return;

    setSubmitting(true);
    setUploadStatus("uploading");
    setUploadProgress(0);

    // Simulate progress ticks while the real fetch is in-flight.
    // Cloudinary's basic upload endpoint doesn't stream progress, so this gives
    // the user visual feedback without XHR. Replace with XMLHttpRequest +
    // xhr.upload.onprogress if you need precise percentages.
    const progressInterval = setInterval(() => {
      setUploadProgress(p => (p < 85 ? p + Math.random() * 18 : p));
    }, 300);

    try {
      const data = new FormData();
      data.append("file", fileRef._selectedFile);
      data.append("upload_preset", UPLOAD_PRESET);
      // Optional: organise uploads into a folder by year
      data.append("folder", `construction/${new Date().getFullYear()}`);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: "POST", body: data }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }

      const json = await res.json();
      // json.secure_url  → the CDN https:// link stored in the entry
      // json.public_id   → useful if you later want to delete via the API
      // json.width/height → available if you want to store aspect ratio

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadStatus("done");

      onAdd({
        id: `entry-${Date.now()}`,
        date: form.date,
        label: form.label,
        note: form.note,
        fileName: form.fileName,
        imageUrl: json.secure_url,   // ← CDN URL, not base64
        cloudinaryId: json.public_id, // stored for future reference
      });

      // Brief pause at 100% so the user sees the "done" state
      setTimeout(() => onClose(), 420);

    } catch (err) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      setUploadStatus("error");
      setUploadError(err.message || "Upload failed. Check your Cloud Name and Preset.");
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: "100%",
    background: "var(--concrete-dark)",
    border: "1px solid var(--border)",
    borderRadius: "2px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    padding: "10px 12px",
    outline: "none",
    boxSizing: "border-box",
    letterSpacing: "0.04em",
  };

  const labelStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: "9px",
    letterSpacing: "0.18em",
    color: "var(--gold)",
    textTransform: "uppercase",
    display: "block",
    marginBottom: "6px",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(6px)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
    }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "var(--card-bg)",
        border: "1px solid var(--gold)",
        borderRadius: "4px",
        width: "100%",
        maxWidth: "480px",
        boxShadow: "0 40px 120px rgba(0,0,0,0.8), 0 0 0 1px var(--gold)",
      }}>
        <div style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "var(--card-header)",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.18em", color: "var(--gold)" }}>
            ◆ ADMIN — ADD ENTRY
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--dust)", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: "24px" }}>
          {!authed ? (
            <div>
              <p style={{ fontFamily: "var(--font-body)", color: "var(--dust)", fontSize: "13px", marginBottom: "20px" }}>
                Enter the admin password to upload a new progress photo.
              </p>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                onKeyDown={e => e.key === "Enter" && tryLogin()}
                style={{ ...inputStyle, borderColor: pwError ? "#e05" : "var(--border)" }}
                placeholder="••••••••"
                autoFocus
              />
              {pwError && <p style={{ color: "#e05", fontFamily: "var(--font-mono)", fontSize: "10px", marginTop: "6px" }}>INCORRECT PASSWORD</p>}
              <button onClick={tryLogin} style={{
                marginTop: "16px", width: "100%", background: "var(--gold)", color: "var(--ink)",
                border: "none", borderRadius: "2px", fontFamily: "var(--font-mono)", fontSize: "11px",
                letterSpacing: "0.15em", fontWeight: 700, padding: "12px", cursor: "pointer",
              }}>UNLOCK →</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Date Taken *</label>
                <input type="date" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Milestone Label</label>
                <input type="text" value={form.label} placeholder="e.g. Roof Framing Complete"
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Short Note</label>
                <textarea value={form.note} placeholder="Brief description of this week's progress..."
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  style={{ ...inputStyle, height: "72px", resize: "vertical" }} />
              </div>
              <div>
                <label style={labelStyle}>Photo *</label>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />

                {/* File picker / preview zone */}
                <button
                  onClick={() => fileRef.current.click()}
                  disabled={submitting}
                  style={{
                    width: "100%", padding: preview ? "12px" : "32px 12px",
                    border: `2px dashed ${preview ? "var(--gold)" : "var(--border)"}`,
                    borderRadius: "2px", background: "transparent", color: "var(--dust)",
                    fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em",
                    cursor: submitting ? "not-allowed" : "pointer", transition: "border-color 0.2s",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
                  }}
                >
                  {preview ? (
                    <>
                      <img src={preview} alt="preview" style={{ maxHeight: "120px", borderRadius: "2px", pointerEvents: "none" }} />
                      {!submitting && (
                        <span style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--dust)" }}>
                          CLICK TO CHANGE
                        </span>
                      )}
                    </>
                  ) : "CLICK TO SELECT PHOTO"}
                </button>

                {/* Upload progress bar — visible while uploading */}
                {(uploadStatus === "uploading" || uploadStatus === "done") && (
                  <div style={{ marginTop: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.12em", color: "var(--dust)" }}>
                        {uploadStatus === "done" ? "✓ UPLOADED TO CLOUDINARY" : "UPLOADING TO CLOUDINARY..."}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: uploadStatus === "done" ? "var(--gold)" : "var(--dust)" }}>
                        {Math.round(uploadProgress)}%
                      </span>
                    </div>
                    <div style={{ height: "2px", background: "var(--concrete-mid)", borderRadius: "1px" }}>
                      <div style={{
                        height: "100%",
                        width: `${uploadProgress}%`,
                        background: uploadStatus === "done"
                          ? "linear-gradient(to right, var(--gold), var(--gold-light))"
                          : "var(--concrete-light)",
                        borderRadius: "1px",
                        transition: "width 0.3s ease, background 0.4s ease",
                        boxShadow: uploadStatus === "done" ? "0 0 6px var(--gold-glow)" : "none",
                      }} />
                    </div>
                  </div>
                )}

                {/* Error message */}
                {uploadStatus === "error" && (
                  <div style={{
                    marginTop: "8px", padding: "10px 12px",
                    background: "rgba(120,30,30,0.15)", border: "1px solid #5a1a1a",
                    borderRadius: "2px", borderLeft: "3px solid #c0392b",
                  }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em", color: "#c0392b", marginBottom: "3px" }}>
                      ◆ UPLOAD FAILED
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#a04040" }}>
                      {uploadError}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--dust)", marginTop: "6px" }}>
                      Check CLOUD_NAME and UPLOAD_PRESET constants, then try again.
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={!form.date || !preview || submitting}
                style={{
                  width: "100%",
                  background: form.date && preview && !submitting ? "var(--gold)" : "var(--concrete-mid)",
                  color: form.date && preview && !submitting ? "var(--ink)" : "var(--dust)",
                  border: "none", borderRadius: "2px", fontFamily: "var(--font-mono)", fontSize: "11px",
                  letterSpacing: "0.15em", fontWeight: 700, padding: "13px",
                  cursor: form.date && preview && !submitting ? "pointer" : "not-allowed",
                  transition: "all 0.25s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                }}>
                {submitting ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      style={{ animation: "spin 1s linear infinite" }}>
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                    {uploadStatus === "uploading" ? "UPLOADING..." : "SAVING..."}
                  </>
                ) : (uploadStatus === "error" ? "RETRY UPLOAD →" : "ADD TO TIMELINE →")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Component: DeleteModal ──────────────────────────────────────────────────

function DeleteModal({ entry, onConfirm, onCancel }) {
  const label = entry?.label || formatDate(entry?.date || "");
  const date  = formatDate(entry?.date || "");
  const [shaking, setShaking] = useState(false);

  // Shake the confirm button once on mount to draw attention to the danger
  useEffect(() => {
    const t = setTimeout(() => setShaking(true), 320);
    const t2 = setTimeout(() => setShaking(false), 700);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
        animation: "backdropIn 0.2s ease",
      }}
    >
      <style>{`
        @keyframes backdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes iconPulse {
          0%,100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.15); opacity: 0.8; }
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-5px); }
          40%      { transform: translateX(5px); }
          60%      { transform: translateX(-4px); }
          80%      { transform: translateX(4px); }
        }
      `}</style>

      <div style={{
        background: "var(--concrete-dark)",
        border: "1px solid #3a1010",
        borderRadius: "4px",
        width: "100%",
        maxWidth: "420px",
        boxShadow: "0 40px 100px rgba(0,0,0,0.85), 0 0 0 1px #2a0a0a, inset 0 1px 0 rgba(255,255,255,0.03)",
        animation: "modalSlideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)",
        overflow: "hidden",
      }}>

        {/* Red accent bar at top */}
        <div style={{
          height: "3px",
          background: "linear-gradient(to right, #7a1a1a, #c0392b, #7a1a1a)",
        }} />

        {/* Body */}
        <div style={{ padding: "32px 28px 24px" }}>

          {/* Warning icon */}
          <div style={{
            width: "52px", height: "52px",
            borderRadius: "50%",
            border: "2px solid #5a1a1a",
            background: "rgba(120,30,30,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: "20px",
            animation: "iconPulse 2.4s ease infinite",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2.2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>

          {/* Heading */}
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            letterSpacing: "0.22em",
            color: "#c0392b",
            marginBottom: "8px",
          }}>
            ◆ PERMANENT ACTION
          </div>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(18px, 4vw, 24px)",
            fontWeight: 900,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            marginBottom: "16px",
          }}>
            Delete this entry?
          </div>

          {/* Entry summary card */}
          <div style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid var(--border)",
            borderLeft: "3px solid #c0392b",
            borderRadius: "2px",
            padding: "12px 14px",
            marginBottom: "20px",
          }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              letterSpacing: "0.12em",
              color: "var(--gold)",
              marginBottom: "3px",
            }}>
              {date}
            </div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--text-primary)",
            }}>
              {label}
            </div>
          </div>

          {/* Warning copy */}
          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: "13px",
            color: "var(--dust)",
            lineHeight: 1.65,
            fontStyle: "italic",
            marginBottom: "28px",
          }}>
            This will permanently remove the photo and all associated data from your timeline. This action cannot be undone.
          </p>

          {/* Divider */}
          <div style={{ height: "1px", background: "var(--border)", marginBottom: "20px" }} />

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={onCancel}
              style={{
                flex: 1,
                background: "transparent",
                border: "1px solid var(--concrete-light)",
                borderRadius: "2px",
                color: "var(--dust)",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                letterSpacing: "0.16em",
                fontWeight: 700,
                padding: "12px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--dust)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--concrete-light)"; e.currentTarget.style.color = "var(--dust)"; }}
            >
              CANCEL
            </button>
            <button
              onClick={onConfirm}
              style={{
                flex: 1.4,
                background: "linear-gradient(135deg, #7a1a1a, #c0392b)",
                border: "1px solid #c0392b",
                borderRadius: "2px",
                color: "#fff",
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                letterSpacing: "0.16em",
                fontWeight: 700,
                padding: "12px",
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: "0 4px 20px rgba(192,57,43,0.35)",
                animation: shaking ? "shake 0.4s ease" : "none",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, #922020, #e74c3c)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(192,57,43,0.55)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, #7a1a1a, #c0392b)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(192,57,43,0.35)"; }}
            >
              CONFIRM DELETE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function ConstructionTracker() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);   // true while initial fetch is in flight
  const [dbError, setDbError] = useState(null);   // non-null string when Supabase is unreachable
  const [showAdmin, setShowAdmin] = useState(false);
  // Seed isAdmin from sessionStorage so the session survives panel close/reopen
  // within the same browser tab. Clears automatically when the tab is closed.
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem("ct_admin") === "1");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);
  const [lightboxEntry, setLightboxEntry] = useState(null);
  const [konami, setKonami] = useState([]);
  const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","a","d"];

  // ── On mount: fetch all entries from Supabase ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadEntries();
        if (!cancelled) setEntries(data);
      } catch (err) {
        if (!cancelled) setDbError("Unable to reach database. Check your Supabase credentials or network connection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep sessionStorage in sync whenever isAdmin changes
  useEffect(() => {
    if (isAdmin) sessionStorage.setItem("ct_admin", "1");
    else sessionStorage.removeItem("ct_admin");
  }, [isAdmin]);

  // Secret: type "uuddad" to open admin
  useEffect(() => {
    const handler = (e) => {
      setKonami(prev => {
        const next = [...prev, e.key].slice(-KONAMI.length);
        if (next.join() === KONAMI.join()) { setShowAdmin(true); return []; }
        return next;
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleAdd = async (entry) => {
    // Optimistic update: add to UI immediately so the admin sees the result
    // without waiting for the Supabase round-trip.
    const optimistic = [entry, ...entries].sort((a, b) => b.date.localeCompare(a.date));
    setEntries(optimistic);

    try {
      await syncEntry(entry);
    } catch {
      // Roll back the optimistic update if Supabase rejects the write
      setEntries(entries);
      setDbError("Failed to save entry to database. Please try again.");
    }
  };

  // Step 1: card's DELETE button calls this → opens the modal
  const handleDelete = (id) => {
    const entry = entries.find(e => e.id === id);
    setEntryToDelete(entry);
    setIsDeleteModalOpen(true);
  };

  // Step 2: modal CONFIRM button — removes from Supabase AND local state
  const confirmDelete = async () => {
    const targetId = entryToDelete.id;

    // 1. Optimistic UI — remove from state immediately so the card vanishes at once.
    const previous = entries;
    const updated = entries.filter(e => e.id !== targetId);
    setEntries(updated);
    setIsDeleteModalOpen(false);

    // 2. Delete from Supabase.
    try {
      await deleteEntry(targetId);
    } catch {
      // Roll back if the DB delete fails
      setEntries(previous);
      setDbError("Failed to delete entry from database. Please try again.");
    }

    // 3. Cloudinary deletion still requires a backend proxy (API Secret must
    //    never be in browser code). See the comment in v7 for the full spec.
    //    The image is orphaned in Cloudinary but no longer shown in the UI.
    //    Clean up manually via the Cloudinary Media Library dashboard as needed.

    setEntryToDelete(null);
  };

  // Step 2 (alt): modal CANCEL button or backdrop click calls this
  const cancelDelete = () => {
    setIsDeleteModalOpen(false);
    setEntryToDelete(null);
  };

  // handleUpdate: receives a full edited entry object from ImageCard's UPDATE button.
  // Replaces the matching entry in state and syncs to Supabase, rolling back on error.
  const handleUpdate = async (updatedEntry) => {
    const previous = entries;
    const updated = entries
      .map(e => e.id === updatedEntry.id ? updatedEntry : e)
      .sort((a, b) => b.date.localeCompare(a.date));

    // Optimistic update
    setEntries(updated);

    try {
      await syncEntry(updatedEntry);
    } catch {
      // Roll back if DB write fails
      setEntries(previous);
      setDbError("Failed to update entry in database. Please try again.");
    }
  };

  // handleLogout: ends the admin session immediately.
  // Setting isAdmin to false causes React to re-render every ImageCard in the
  // same synchronous commit — EDIT and DELETE buttons disappear without any
  // refresh. sessionStorage.removeItem is explicit (not relying solely on the
  // useEffect sync) so the session is cleared even if the component unmounts
  // before the effect fires.
  const handleLogout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem("ct_admin");
    setShowAdmin(false); // close the panel if it happens to be open
  };

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  // ── Shimmer skeleton shown while the initial Supabase fetch is in flight ──
  if (loading) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inconsolata:wght@400;600;700&family=Lora:ital,wght@0,400;1,400&display=swap');
          :root {
            --gold: #C9A84C; --gold-light: #e8c97a; --gold-glow: rgba(201,168,76,0.35);
            --ink: #0D0D0D; --concrete-dark: #161616; --concrete-mid: #2a2a2a;
            --concrete-light: #3d3d3d; --dust: #888; --text-primary: #E8E4DC;
            --border: #252525; --card-bg: #131313; --card-header: #161616;
            --font-display: 'Playfair Display', Georgia, serif;
            --font-mono: 'Inconsolata', monospace;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: var(--ink); }
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
        <div style={{ minHeight: "100vh", background: "var(--ink)", padding: "48px 24px" }}>
          <div style={{ maxWidth: "860px", margin: "0 auto" }}>
            {/* Skeleton header */}
            <div style={{ marginBottom: "48px" }}>
              <div style={{ width: "120px", height: "10px", borderRadius: "2px", marginBottom: "12px", background: "linear-gradient(110deg, var(--concrete-dark) 30%, var(--concrete-mid) 50%, var(--concrete-dark) 70%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s infinite" }} />
              <div style={{ width: "280px", height: "26px", borderRadius: "2px", background: "linear-gradient(110deg, var(--concrete-dark) 30%, var(--concrete-mid) 50%, var(--concrete-dark) 70%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s infinite" }} />
            </div>
            {/* Skeleton cards */}
            {[1,2,3].map(i => (
              <div key={i} style={{ display: "flex", gap: "28px", marginBottom: "40px" }}>
                <div style={{ width: "56px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "40px", height: "16px", borderRadius: "2px", background: "linear-gradient(110deg, var(--concrete-dark) 30%, var(--concrete-mid) 50%, var(--concrete-dark) 70%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s infinite" }} />
                  <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "var(--concrete-mid)" }} />
                  <div style={{ width: "2px", height: "200px", background: "linear-gradient(to bottom, var(--concrete-mid), transparent)" }} />
                </div>
                <div style={{ flex: 1, background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--card-header)" }}>
                    <div style={{ width: "90px", height: "10px", borderRadius: "2px", marginBottom: "8px", background: "linear-gradient(110deg, var(--concrete-dark) 30%, var(--concrete-mid) 50%, var(--concrete-dark) 70%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s infinite" }} />
                    <div style={{ width: "200px", height: "20px", borderRadius: "2px", background: "linear-gradient(110deg, var(--concrete-dark) 30%, var(--concrete-mid) 50%, var(--concrete-dark) 70%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s infinite" }} />
                  </div>
                  <div style={{ height: "220px", background: "linear-gradient(110deg, var(--concrete-dark) 30%, var(--concrete-mid) 50%, var(--concrete-dark) 70%)", backgroundSize: "200% 100%", animation: "shimmer 1.8s infinite" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inconsolata:wght@400;600;700&family=Lora:ital,wght@0,400;1,400&display=swap');

        :root {
          --gold: #C9A84C;
          --gold-light: #e8c97a;
          --gold-glow: rgba(201,168,76,0.35);
          --ink: #0D0D0D;
          --concrete-dark: #161616;
          --concrete-mid: #2a2a2a;
          --concrete-light: #3d3d3d;
          --dust: #888;
          --text-primary: #E8E4DC;
          --border: #252525;
          --card-bg: #131313;
          --card-header: #161616;
          --font-display: 'Playfair Display', Georgia, serif;
          --font-mono: 'Inconsolata', monospace;
          --font-body: 'Lora', Georgia, serif;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--ink); color: var(--text-primary); }
        ::selection { background: var(--gold); color: var(--ink); }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-gold {
          0%, 100% { box-shadow: 0 0 0 0 var(--gold-glow); }
          50% { box-shadow: 0 0 0 8px transparent; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
        textarea:focus, input:focus { border-color: var(--gold) !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: var(--ink); }
        ::-webkit-scrollbar-thumb { background: var(--concrete-light); border-radius: 2px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "var(--ink)", position: "relative" }}>

        {/* Grain texture overlay */}
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E")`,
          opacity: 0.6,
        }} />

        {/* Database error banner — dismissible */}
        {dbError && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
            background: "rgba(120,20,20,0.97)",
            borderBottom: "2px solid #c0392b",
            backdropFilter: "blur(8px)",
            padding: "12px 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", color: "#ffaaaa" }}>
                ◆ DB ERROR — {dbError}
              </span>
            </div>
            <button
              onClick={() => setDbError(null)}
              style={{ background: "none", border: "none", color: "#ff6b6b", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "0 4px" }}
            >✕</button>
          </div>
        )}

        {/* Header */}
        <header style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(13,13,13,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          animation: "fadeDown 0.6s ease",
        }}>
          <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0" }}>
              <div>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.22em",
                  color: "var(--gold)", marginBottom: "3px",
                }}>
                  ◆ SITE DOCUMENT
                </div>
                <h1 style={{
                  fontFamily: "var(--font-display)", fontSize: "clamp(18px, 3vw, 26px)",
                  fontWeight: 900, letterSpacing: "-0.02em", color: "var(--text-primary)",
                  lineHeight: 1,
                }}>
                  Construction Progress
                </h1>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--dust)", letterSpacing: "0.1em" }}>
                    ENTRIES
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "22px", color: "var(--gold)", fontWeight: 700, lineHeight: 1 }}>
                    {sorted.length.toString().padStart(2, "0")}
                  </div>
                </div>
                {/* Admin session indicator + logout */}
                {isAdmin && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    animation: "fadeDown 0.3s ease",
                  }}>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.16em",
                      color: "#c0392b", border: "1px solid #5a1a1a", borderRadius: "2px",
                      padding: "4px 8px", whiteSpace: "nowrap",
                    }}>
                      ◆ ADMIN
                    </div>
                    <button
                      onClick={handleLogout}
                      title="End admin session"
                      style={{
                        display: "flex", alignItems: "center", gap: "5px",
                        background: "transparent",
                        border: "1px solid #3a1a1a",
                        borderRadius: "2px",
                        color: "#6b3030",
                        fontFamily: "var(--font-mono)",
                        fontSize: "8px",
                        letterSpacing: "0.16em",
                        fontWeight: 700,
                        padding: "4px 9px",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = "#c0392b";
                        e.currentTarget.style.color = "#c0392b";
                        e.currentTarget.style.background = "rgba(192,57,43,0.07)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = "#3a1a1a";
                        e.currentTarget.style.color = "#6b3030";
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      LOGOUT
                    </button>
                  </div>
                )}
                {/* Secret admin trigger — also works via button for mobile */}
                <button
                  onClick={() => setShowAdmin(true)}
                  title="Admin (or press ↑↑↓↓AD)"
                  style={{
                    width: "36px", height: "36px", borderRadius: "2px",
                    border: "1px solid var(--concrete-mid)",
                    background: "transparent", color: "var(--concrete-light)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s", fontSize: "14px",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.color = "var(--gold)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--concrete-mid)"; e.currentTarget.style.color = "var(--concrete-light)"; }}
                >
                  ＋
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {sorted.length > 0 && (
              <div style={{ paddingBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--dust)", letterSpacing: "0.15em" }}>
                    {formatDate(sorted[sorted.length - 1]?.date)} — START
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--gold)", letterSpacing: "0.15em" }}>
                    {formatDate(sorted[0]?.date)} — LATEST
                  </span>
                </div>
                <div style={{ height: "2px", background: "var(--concrete-mid)", borderRadius: "1px" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, (sorted.length / 52) * 100)}%`,
                    background: "linear-gradient(to right, var(--gold), var(--gold-light))",
                    borderRadius: "1px",
                    transition: "width 1s ease",
                    boxShadow: "0 0 8px var(--gold-glow)",
                  }} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--dust)", marginTop: "4px", textAlign: "right", letterSpacing: "0.1em" }}>
                  {sorted.length} OF 52 WEEKS LOGGED
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Timeline */}
        <main style={{ maxWidth: "860px", margin: "0 auto", padding: "48px 24px 80px" }}>

          {/* Year separator */}
          {sorted.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "40px", paddingLeft: "84px" }}>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
              <span style={{
                fontFamily: "var(--font-display)", fontSize: "13px", color: "var(--dust)",
                letterSpacing: "0.08em", whiteSpace: "nowrap",
              }}>
                {new Date(sorted[0].date + "T12:00:00").getFullYear()}
              </span>
              <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            </div>
          )}

          {sorted.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "80px 20px",
              fontFamily: "var(--font-body)", color: "var(--dust)", fontStyle: "italic",
            }}>
              No entries yet. Click ＋ to add your first progress photo.
            </div>
          ) : (
            sorted.map((entry, i) => (
              <ImageCard key={entry.id} entry={entry} index={i} isFirst={i === 0} isAdmin={isAdmin} onDelete={handleDelete} onOpenLightbox={setLightboxEntry} onUpdate={handleUpdate} />
            ))
          )}

          {/* Footer signature */}
          <div style={{ textAlign: "center", paddingTop: "40px", paddingLeft: "84px" }}>
            <div style={{ width: "1px", height: "40px", background: "var(--border)", margin: "0 auto 20px" }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.18em", color: "var(--concrete-light)" }}>
              CONSTRUCTION PROGRESS TRACKER • {new Date().getFullYear()}
            </div>
          </div>
        </main>
      </div>

      {showAdmin && <AdminPanel onAdd={handleAdd} onLogin={() => setIsAdmin(true)} onClose={() => setShowAdmin(false)} isAdmin={isAdmin} />}
      {isDeleteModalOpen && entryToDelete && (
        <DeleteModal
          entry={entryToDelete}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
      {lightboxEntry && (
        <Lightbox entry={lightboxEntry} onClose={() => setLightboxEntry(null)} />
      )}

      <Analytics />
    </>
  );
}