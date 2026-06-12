import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

import LetterPdfPreview from "./LetterPdfPreview.jsx";

const letterHeadUrl = "/letter-head.jpg";
const ddkaLogoUrl =
  "https://res.cloudinary.com/dmmll82la/image/upload/v1766683651/ddka-logo_ywnhyh.png";
const storageKey = "letter-generator-state";
const authStorageKey = "letter-generator-authenticated";
const authExpiryKey = "letter-generator-auth-expires-at";
const authDurationMs = 2 * 60 * 60 * 1000;
const expectedLoginId = import.meta.env.VITE_LOGIN_ID?.trim() || "";
const expectedLoginPassword = import.meta.env.VITE_LOGIN_PASSWORD?.trim() || "";

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function parseBodyForBold(text) {
  const parts = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: text.substring(lastIndex, match.index),
        bold: false,
        color: null,
      });
    }
    parts.push({ text: match[1], bold: true, color: null });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.substring(lastIndex), bold: false, color: null });
  }

  return parts.length > 0 ? parts : [{ text, bold: false, color: null }];
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bodyToHtml(text) {
  const parts = parseTextWithColors(text || "");
  return parts
    .map((part) => {
      let t = escapeHtml(part.text).replace(/\n/g, "<br>");
      if (part.bold) t = `<strong>${t}</strong>`;
      if (part.color) t = `<span style=\"color:${part.color}\">${t}</span>`;
      return t;
    })
    .join("");
}

function parseTextWithColors(text) {
  const parts = [];
  const colorRegex = /\{color:([^}]+)\}(.*?)\{\/color\}/g;
  const boldRegex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;
  const tempParts = [];

  // First pass: extract colors
  while ((match = colorRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tempParts.push({
        text: text.substring(lastIndex, match.index),
        bold: false,
        color: null,
      });
    }
    tempParts.push({ text: match[2], bold: false, color: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tempParts.push({
      text: text.substring(lastIndex),
      bold: false,
      color: null,
    });
  }

  // Second pass: check for bold within each part
  tempParts.forEach((part) => {
    let remaining = part.text;
    let partIndex = 0;

    boldRegex.lastIndex = 0;
    let boldMatch;
    while ((boldMatch = boldRegex.exec(remaining)) !== null) {
      if (boldMatch.index > partIndex) {
        parts.push({
          text: remaining.substring(partIndex, boldMatch.index),
          bold: false,
          color: part.color,
        });
      }
      parts.push({ text: boldMatch[1], bold: true, color: part.color });
      partIndex = boldMatch.index + boldMatch[0].length;
    }

    if (partIndex < remaining.length) {
      parts.push({
        text: remaining.substring(partIndex),
        bold: false,
        color: part.color,
      });
    }
  });

  return parts.length > 0 ? parts : [{ text, bold: false, color: null }];
}

const LETTER_LAYOUT = {
  refValue: { x: 29.2, y: 23.5, width: 20, height: 6 },
  dateValue: { x: 80.0, y: 22.0, width: 20, height: 6 },
  heading: { x: 25.0, y: 29.5, width: 70, height: 8 },
  body: { x: 25.0, y: 37.5, width: 70, height: 40 },
};

/**
 * Single source of truth for letter PDF (download + on-screen preview).
 */
async function createLetterPdf({
  refNumber,
  displayDate,
  heading,
  body,
  headingColor,
  bodyColor,
  boldBody,
  positions = LETTER_LAYOUT,
}) {
  // Use html2canvas to render an HTML representation so browser fonts (Hindi) work.
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Offscreen container sized to A4 in mm so css mm units map nicely.
  const container = document.createElement("div");
  container.style.width = `${pageWidth}mm`;
  container.style.height = `${pageHeight}mm`;
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.background = "#fff";
  container.style.fontFamily =
    getComputedStyle(document.documentElement).fontFamily || "sans-serif";

  // Letterhead image
  const img = document.createElement("img");
  img.src = letterHeadUrl;
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";
  img.style.position = "absolute";
  img.style.left = "0";
  img.style.top = "0";
  container.appendChild(img);
  // Wait for letterhead image to load (reduce html2canvas failures)
  try {
    if (typeof img.decode === "function") {
      await img.decode();
    } else {
      await new Promise((res) => {
        if (img.complete && img.naturalWidth) return res();
        img.onload = () => res();
        img.onerror = () => res();
      });
    }
  } catch {
    // ignore — proceed anyway
  }

  const makeText = (text, opts = {}) => {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.left = `${opts.x}%`;
    el.style.top = `${opts.y}%`;
    if (opts.width) el.style.width = `${opts.width}%`;
    if (opts.height) el.style.height = `${opts.height}%`;
    // anchor: center (default) or left
    if (opts.anchor === "left") {
      el.style.transform = "translate(0, -50%)";
    } else {
      el.style.transform = "translate(-50%, -50%)";
    }
    el.style.color = opts.color || "#1f2937";
    el.style.whiteSpace = opts.pre ? "pre-wrap" : "normal";
    el.style.wordBreak = "break-word";
    el.style.boxSizing = "border-box";
    if (opts.height) el.style.overflow = "hidden";
    el.style.textAlign = opts.align || "left";
    if (opts.bold) el.style.fontWeight = "700";
    if (opts.fontSize) el.style.fontSize = opts.fontSize;
    el.innerHTML = opts.html || escapeHtml(text || "");
    return el;
  };

  // Reference number
  container.appendChild(
    makeText(refNumber || "23/26", {
      x: positions.refValue.x,
      y: positions.refValue.y,
      width: positions.refValue.width,
      height: positions.refValue.height,
      anchor: "left",
      color: "#1f2937",
      fontSize: "12px",
    }),
  );

  // Date
  container.appendChild(
    makeText(displayDate || "", {
      x: positions.dateValue.x,
      y: positions.dateValue.y,
      width: positions.dateValue.width,
      height: positions.dateValue.height,
      anchor: "left",
      color: "#1f2937",
      fontSize: "12px",
    }),
  );

  // Heading
  container.appendChild(
    makeText(heading || "", {
      x: positions.heading.x,
      y: positions.heading.y,
      width: positions.heading.width,
      height: positions.heading.height,
      anchor: "left",
      color: headingColor || "#000",
      bold: true,
      fontSize: "20px",
      html: escapeHtml(heading || "").replace(/\n/g, "<br>"),
    }),
  );

  // Body
  container.appendChild(
    makeText(body || "", {
      x: positions.body.x,
      y: positions.body.y,
      width: positions.body.width,
      height: positions.body.height,
      anchor: "left",
      color: bodyColor || "#000",
      fontSize: "14px",
      pre: true,
      html: bodyToHtml(body),
    }),
  );

  document.body.appendChild(container);

  try {
    const scale = 2; // improve quality
    // compute pixel dimensions of the container
    const containerWidth = Math.max(1, container.offsetWidth);
    const containerHeight = Math.max(1, container.offsetHeight);

    const canvas = await html2canvas(container, {
      scale,
      useCORS: true,
      backgroundColor: null,
      // prevent html2canvas from trying to restore scroll on cloned doc
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.ceil(containerWidth),
      windowHeight: Math.ceil(containerHeight),
      onclone: (clonedDoc) => {
        try {
          // ensure cloned document is at origin and has no smooth scroll
          clonedDoc.documentElement.style.scrollBehavior = "auto";
          clonedDoc.defaultView?.scrollTo(0, 0);
          clonedDoc.body?.scrollTo(0, 0);
        } catch (e) {
          // swallow errors - this just avoids noisy warnings
        }
      },
    });
    const imgData = canvas.toDataURL("image/png", 1);
    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pageHeight);
  } finally {
    document.body.removeChild(container);
  }

  return pdf;
}

function OverlayItem({
  sheet,
  x,
  y,
  width = 10,
  height = 10,
  anchor = "center",
  onMove,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  dragging = false,
  children,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !sheet) return;
    const handlePointerDown = (ev) => {
      ev.preventDefault();
      try {
        el.setPointerCapture?.(ev.pointerId);
      } catch {}

      if (typeof onDragStart === "function") onDragStart();

      const pointerId = ev.pointerId;
      const startX = ev.clientX;
      const startY = ev.clientY;

      const rect = sheet.getBoundingClientRect();
      const basePx = (x / 100) * rect.width;
      const basePy = (y / 100) * rect.height;

      const onMoveWindow = (moveEv) => {
        if (moveEv.pointerId !== pointerId) return;
        const dx = moveEv.clientX - startX;
        const dy = moveEv.clientY - startY;
        const px = ((basePx + dx) / rect.width) * 100;
        const py = ((basePy + dy) / rect.height) * 100;
        onMove(Math.max(0, Math.min(100, px)), Math.max(0, Math.min(100, py)));
      };

      const onUp = (upEv) => {
        if (upEv.pointerId !== pointerId) return;
        try {
          el.releasePointerCapture?.(pointerId);
        } catch {}
        window.removeEventListener("pointermove", onMoveWindow);
        window.removeEventListener("pointerup", onUp);
        if (typeof onDragEnd === "function") onDragEnd();
      };

      window.addEventListener("pointermove", onMoveWindow);
      window.addEventListener("pointerup", onUp);
    };

    el.addEventListener("pointerdown", handlePointerDown);
    return () => el.removeEventListener("pointerdown", handlePointerDown);
  }, [sheet, x, y, width, height, anchor, onMove, onDragStart, onDragEnd]);

  const style = {
    left: `${x}%`,
    top: `${y}%`,
    width: width ? `${width}%` : undefined,
    height: height ? `${height}%` : undefined,
  };

  // anchor left should translate X by 0, otherwise center
  if (anchor === "left") {
    style.transform = "translate(0, -50%)";
  } else {
    style.transform = "translate(-50%, -50%)";
  }

  return (
    <div
      ref={ref}
      className={`overlay-item${dragging ? " overlay-item--dragging" : ""}`}
      style={style}
      role="presentation"
      onDoubleClick={onDoubleClick}
    >
      <div
        onDoubleClick={onDoubleClick}
        style={{ width: "100%", height: "100%" }}
      >
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const bodyTextareaRef = useRef(null);
  const authTimerRef = useRef(null);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const storedAuth = sessionStorage.getItem(authStorageKey) === "true";
    const storedExpiry = Number(sessionStorage.getItem(authExpiryKey) || 0);

    if (!storedAuth || !storedExpiry) {
      return false;
    }

    if (Date.now() >= storedExpiry) {
      sessionStorage.removeItem(authStorageKey);
      sessionStorage.removeItem(authExpiryKey);
      return false;
    }

    return true;
  });

  const [refNumber, setRefNumber] = useState(() => {
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) return "23/26";

    try {
      const parsedState = JSON.parse(savedState);
      return parsedState.refNumber || "23/26";
    } catch {
      return "23/26";
    }
  });

  const [dateValue, setDateValue] = useState(() => {
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) return formatDateInput(new Date());

    try {
      const parsedState = JSON.parse(savedState);
      return parsedState.dateValue || formatDateInput(new Date());
    } catch {
      return formatDateInput(new Date());
    }
  });

  const [heading, setHeading] = useState(() => {
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) return "";

    try {
      const parsedState = JSON.parse(savedState);
      return parsedState.heading || "";
    } catch {
      return "";
    }
  });

  const [body, setBody] = useState(() => {
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) {
      return "";
    }

    try {
      const parsedState = JSON.parse(savedState);
      return parsedState.body || "";
    } catch {
      return "";
    }
  });
  const [boldBody, setBoldBody] = useState(() => {
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) return false;

    try {
      const parsedState = JSON.parse(savedState);
      return parsedState.boldBody || false;
    } catch {
      return false;
    }
  });
  const [headingColor, setHeadingColor] = useState(() => {
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) return "#000000";

    try {
      const parsedState = JSON.parse(savedState);
      return parsedState.headingColor || "#000000";
    } catch {
      return "#000000";
    }
  });
  const [bodyColor, setBodyColor] = useState(() => {
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) return "#000000";

    try {
      const parsedState = JSON.parse(savedState);
      return parsedState.bodyColor || "#000000";
    } catch {
      return "#000000";
    }
  });
  const [isExporting, setIsExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPdfBuffer, setPreviewPdfBuffer] = useState(null);
  const [selectedWordColor, setSelectedWordColor] = useState("#FF6B6B");
  const [positions, setPositions] = useState(() => {
    const savedState = localStorage.getItem(storageKey);
    if (!savedState) return LETTER_LAYOUT;
    try {
      const parsed = JSON.parse(savedState);
      return parsed.positions || LETTER_LAYOUT;
    } catch {
      return LETTER_LAYOUT;
    }
  });
  const [sheetEl, setSheetEl] = useState(null);
  const [manualPositioning, setManualPositioning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const resizeStateRef = useRef(null);

  const displayDate = useMemo(() => formatDisplayDate(dateValue), [dateValue]);
  const isLoginConfigured = Boolean(expectedLoginId && expectedLoginPassword);

  useEffect(() => {
    if (!isAuthenticated || !showPreview) {
      setPreviewPdfBuffer(null);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const pdf = await createLetterPdf({
            refNumber,
            displayDate,
            heading,
            body,
            headingColor,
            bodyColor,
            boldBody,
            positions,
          });
          const buffer = pdf.output("arraybuffer");
          if (!cancelled) {
            const copy =
              typeof buffer.slice === "function"
                ? buffer.slice(0)
                : Uint8Array.from(new Uint8Array(buffer)).buffer;
            setPreviewPdfBuffer(copy);
          }
        } catch {
          if (!cancelled) setPreviewPdfBuffer(null);
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isAuthenticated,
    showPreview,
    refNumber,
    displayDate,
    heading,
    body,
    headingColor,
    bodyColor,
    boldBody,
    positions,
  ]);

  const handleLogin = (event) => {
    event.preventDefault();

    if (!isLoginConfigured) {
      setLoginError(
        "Login is not configured. Add VITE_LOGIN_ID and VITE_LOGIN_PASSWORD to your env file.",
      );
      return;
    }

    const trimmedLoginId = loginId.trim();
    const trimmedPassword = loginPassword.trim();

    if (
      trimmedLoginId === expectedLoginId &&
      trimmedPassword === expectedLoginPassword
    ) {
      sessionStorage.setItem(authStorageKey, "true");
      sessionStorage.setItem(
        authExpiryKey,
        String(Date.now() + authDurationMs),
      );
      setIsAuthenticated(true);
      setLoginError("");
      setLoginPassword("");
      return;
    }

    setLoginError("Invalid ID or password. Please try again.");
  };

  const handleLogout = () => {
    sessionStorage.removeItem(authStorageKey);
    sessionStorage.removeItem(authExpiryKey);
    setIsAuthenticated(false);
    setLoginId("");
    setLoginPassword("");
    setLoginError("");
  };

  useEffect(() => {
    if (!isAuthenticated) {
      if (authTimerRef.current) {
        clearTimeout(authTimerRef.current);
        authTimerRef.current = null;
      }
      return;
    }

    const storedExpiry = Number(sessionStorage.getItem(authExpiryKey) || 0);
    const remainingTime = Math.max(storedExpiry - Date.now(), 0);

    if (!storedExpiry || remainingTime <= 0) {
      handleLogout();
      return;
    }

    authTimerRef.current = window.setTimeout(() => {
      handleLogout();
    }, remainingTime);

    return () => {
      if (authTimerRef.current) {
        clearTimeout(authTimerRef.current);
        authTimerRef.current = null;
      }
    };
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        refNumber,
        dateValue,
        heading,
        body,
        boldBody,
        headingColor,
        bodyColor,
        positions,
      }),
    );
  }, [
    refNumber,
    dateValue,
    heading,
    body,
    boldBody,
    headingColor,
    bodyColor,
    positions,
  ]);

  if (!isAuthenticated) {
    return (
      <div className="app-shell auth-shell">
        <main className="auth-card" aria-labelledby="login-title">
          <div className="auth-badge">
            <img src={ddkaLogoUrl} alt="DDKA Logo" className="auth-logo" />
          </div>

          <p className="eyebrow">Verified Access Only</p>
          <h1 id="login-title">DDKA Letter Generator</h1>
          <p className="auth-copy">
            Enter your verified ID and password to access the premium letter
            generator.
          </p>

          {!isLoginConfigured && (
            <div className="auth-warning">
              Add <strong>VITE_LOGIN_ID</strong> and{" "}
              <strong>VITE_LOGIN_PASSWORD</strong> to your env file before
              deploying.
            </div>
          )}

          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              <span>Login ID</span>
              <input
                id="login-id"
                name="username"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="Enter your ID"
                autoComplete="username"
              />
            </label>

            <label>
              <span>Password</span>
              <input
                id="login-password"
                name="password"
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </label>

            {loginError && <p className="auth-error">{loginError}</p>}

            <button type="submit" className="auth-button">
              Enter Dashboard
            </button>
          </form>
        </main>
      </div>
    );
  }

  const handleBoldSelected = () => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.substring(start, end);

    if (!selected) return;

    const isBolded = selected.startsWith("**") && selected.endsWith("**");
    let newBody;

    if (isBolded) {
      newBody =
        body.substring(0, start) + selected.slice(2, -2) + body.substring(end);
    } else {
      newBody =
        body.substring(0, start) + `**${selected}**` + body.substring(end);
    }

    setBody(newBody);
  };

  const handleColorSelected = () => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.substring(start, end);

    if (!selected) return;

    // Check if already has color
    const colorRegex = new RegExp(
      `\\{color:${selectedWordColor}\\}.*?\\{/color\\}`,
    );
    const isColored = colorRegex.test(selected);
    let newBody;

    if (isColored) {
      // Remove color
      newBody =
        body.substring(0, start) +
        selected.replace(
          new RegExp(`\\{color:${selectedWordColor}\\}|\\{/color\\}`, "g"),
          "",
        ) +
        body.substring(end);
    } else {
      // Add color
      newBody =
        body.substring(0, start) +
        `{color:${selectedWordColor}}${selected}{/color}` +
        body.substring(end);
    }

    setBody(newBody);
  };

  const handleDownloadPdf = async () => {
    if (isExporting) return;

    setIsExporting(true);
    try {
      const pdf = await createLetterPdf({
        refNumber: refNumber || "23/26",
        displayDate,
        heading,
        body,
        headingColor,
        bodyColor,
        boldBody,
        positions,
      });
      pdf.save("letter.pdf");
    } catch (error) {
      setIsExporting(false);
      throw error;
    } finally {
      setIsExporting(false);
    }
  };

  const resetPositions = () => setPositions(LETTER_LAYOUT);

  // Resize logic for overlay boxes (heading/body)
  const handleStartResize = (areaKey, corner, ev) => {
    ev.preventDefault();
    if (!sheetEl) return;
    const pointerId = ev.pointerId;
    try {
      ev.currentTarget.setPointerCapture?.(pointerId);
    } catch {}

    const rect = sheetEl.getBoundingClientRect();
    const startX = ev.clientX;
    const startY = ev.clientY;
    const start = positions[areaKey];
    const startWidthPx = (start.width / 100) * rect.width;
    const startHeightPx = (start.height / 100) * rect.height;
    const startLeftPx = (start.x / 100) * rect.width;
    const startTopPx = (start.y / 100) * rect.height;

    const minWidthPx = Math.max(40, rect.width * 0.1);
    const minHeightPx = Math.max(24, rect.height * 0.03);

    const onMove = (moveEv) => {
      if (moveEv.pointerId !== pointerId) return;
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;

      let newLeft = startLeftPx;
      let newTop = startTopPx;
      let newW = startWidthPx;
      let newH = startHeightPx;

      // horizontal
      if (corner === "tr" || corner === "br") {
        newW = Math.max(minWidthPx, startWidthPx + dx);
      } else if (corner === "tl" || corner === "bl") {
        newW = Math.max(minWidthPx, startWidthPx - dx);
        newLeft = startLeftPx + dx;
      }

      // vertical
      if (corner === "bl" || corner === "br") {
        newH = Math.max(minHeightPx, startHeightPx + dy);
      } else if (corner === "tl" || corner === "tr") {
        newH = Math.max(minHeightPx, startHeightPx - dy);
        newTop = startTopPx + dy;
      }

      const newWPercent = Math.max(5, Math.min(100, (newW / rect.width) * 100));
      const newHPercent = Math.max(
        3,
        Math.min(100, (newH / rect.height) * 100),
      );
      const newXPercent = Math.max(
        0,
        Math.min(100, (newLeft / rect.width) * 100),
      );
      const newYPercent = Math.max(
        0,
        Math.min(100, (newTop / rect.height) * 100),
      );

      setPositions((p) => ({
        ...p,
        [areaKey]: {
          ...p[areaKey],
          width: Math.round(newWPercent * 100) / 100,
          height: Math.round(newHPercent * 100) / 100,
          x: Math.round(newXPercent * 100) / 100,
          y: Math.round(newYPercent * 100) / 100,
        },
      }));
    };

    const onUp = (upEv) => {
      if (upEv.pointerId !== pointerId) return;
      try {
        ev.currentTarget.releasePointerCapture?.(pointerId);
      } catch {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = async () => {
    setIsDragging(false);
    // regenerate preview immediately after drag ends
    if (!isAuthenticated || !showPreview) return;
    try {
      const pdf = await createLetterPdf({
        refNumber,
        displayDate,
        heading,
        body,
        headingColor,
        bodyColor,
        boldBody,
        positions,
      });
      const buffer = pdf.output("arraybuffer");
      const copy =
        typeof buffer.slice === "function"
          ? buffer.slice(0)
          : Uint8Array.from(new Uint8Array(buffer)).buffer;
      setPreviewPdfBuffer(copy);
    } catch {
      // ignore — preview effect will try again
    }
  };

  return (
    <div className="app-shell">
      <main
        className={`workspace${showPreview ? "" : " workspace--editor-only"}`}
      >
        <section className="editor-panel">
          <div className="panel-branding">
            <img
              src={ddkaLogoUrl}
              alt="DDKA Logo"
              className="panel-ddka-logo"
            />
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
          >
            Sign out
          </button>

          <div className="panel-copy">
            <p className="eyebrow">DDKA Letter Generator</p>
            <h1>Create Premium Letters for DDKA</h1>
            <p>
              Customize colors, bold text, and style individual words. Wrap
              **text** to bold it, or {"{color:#FF0000}text{/color}"} to change
              word color.
            </p>
          </div>

          <div className="field-grid">
            <label>
              <span>Reference Number</span>
              <input
                id="letter-ref-number"
                name="refNumber"
                value={refNumber}
                onChange={(event) => setRefNumber(event.target.value)}
                placeholder="23/26"
              />
            </label>

            <label>
              <span>Date</span>
              <input
                id="letter-date"
                name="letterDate"
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
              />
            </label>

            <label className="full-span">
              <span>Heading</span>
              <div className="input-with-color">
                <input
                  id="letter-heading"
                  name="heading"
                  value={heading}
                  onChange={(event) => setHeading(event.target.value)}
                  placeholder="Enter your heading..."
                />
                <input
                  id="letter-heading-color"
                  name="headingColor"
                  type="color"
                  value={headingColor}
                  onChange={(event) => setHeadingColor(event.target.value)}
                  className="color-picker"
                  title="Heading color"
                />
              </div>
            </label>

            <label className="full-span">
              <span>Body</span>
              <div className="input-with-color">
                <textarea
                  id="letter-body"
                  name="body"
                  ref={bodyTextareaRef}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={8}
                  placeholder="Enter your body text. Wrap **words** to bold them, or {color:#FF0000}words{/color} to change color..."
                />
                <input
                  id="letter-body-color"
                  name="bodyColor"
                  type="color"
                  value={bodyColor}
                  onChange={(event) => setBodyColor(event.target.value)}
                  className="color-picker"
                  title="Default body text color"
                />
              </div>
              <button
                type="button"
                className="bold-button"
                onClick={handleBoldSelected}
                title="Select text and click to toggle bold"
              >
                Bold Selected
              </button>

              <div className="color-selected-group">
                <div className="color-selector-controls">
                  <input
                    id="letter-selection-color"
                    name="selectedWordColor"
                    type="color"
                    value={selectedWordColor}
                    onChange={(event) =>
                      setSelectedWordColor(event.target.value)
                    }
                    className="word-color-picker"
                    title="Choose a color for selected text"
                  />
                  <button
                    type="button"
                    className="color-button"
                    onClick={handleColorSelected}
                    title="Select text and click to apply color"
                  >
                    Color Selected
                  </button>
                </div>
              </div>
              <div className="position-controls-grid">
                <label className="position-control-item">
                  <span style={{ fontWeight: 700 }}>Ref width %</span>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={positions.refValue.width}
                    onChange={(e) =>
                      setPositions((p) => ({
                        ...p,
                        refValue: {
                          ...p.refValue,
                          width: Number(e.target.value),
                        },
                      }))
                    }
                    className="position-control-input"
                  />
                </label>

                <label className="position-control-item">
                  <span style={{ fontWeight: 700 }}>Ref height %</span>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={positions.refValue.height}
                    onChange={(e) =>
                      setPositions((p) => ({
                        ...p,
                        refValue: {
                          ...p.refValue,
                          height: Number(e.target.value),
                        },
                      }))
                    }
                    className="position-control-input"
                  />
                </label>

                <label className="position-control-item">
                  <span style={{ fontWeight: 700 }}>Date width %</span>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={positions.dateValue.width}
                    onChange={(e) =>
                      setPositions((p) => ({
                        ...p,
                        dateValue: {
                          ...p.dateValue,
                          width: Number(e.target.value),
                        },
                      }))
                    }
                    className="position-control-input"
                  />
                </label>

                <label className="position-control-item">
                  <span style={{ fontWeight: 700 }}>Date height %</span>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={positions.dateValue.height}
                    onChange={(e) =>
                      setPositions((p) => ({
                        ...p,
                        dateValue: {
                          ...p.dateValue,
                          height: Number(e.target.value),
                        },
                      }))
                    }
                    className="position-control-input"
                  />
                </label>

                <label className="position-control-item">
                  <span style={{ fontWeight: 700 }}>Body width %</span>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={positions.body.width}
                    onChange={(e) =>
                      setPositions((p) => ({
                        ...p,
                        body: { ...p.body, width: Number(e.target.value) },
                      }))
                    }
                    className="position-control-input"
                  />
                </label>

                <label className="position-control-item">
                  <span style={{ fontWeight: 700 }}>Body height %</span>
                  <input
                    type="number"
                    min={5}
                    max={90}
                    value={positions.body.height}
                    onChange={(e) =>
                      setPositions((p) => ({
                        ...p,
                        body: { ...p.body, height: Number(e.target.value) },
                      }))
                    }
                    className="position-control-input"
                  />
                </label>

                <label className="position-control-item">
                  <span style={{ fontWeight: 700 }}>Heading width %</span>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={positions.heading.width}
                    onChange={(e) =>
                      setPositions((p) => ({
                        ...p,
                        heading: {
                          ...p.heading,
                          width: Number(e.target.value),
                        },
                      }))
                    }
                    className="position-control-input"
                  />
                </label>

                <label className="position-control-item">
                  <span style={{ fontWeight: 700 }}>Heading height %</span>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={positions.heading.height}
                    onChange={(e) =>
                      setPositions((p) => ({
                        ...p,
                        heading: {
                          ...p.heading,
                          height: Number(e.target.value),
                        },
                      }))
                    }
                    className="position-control-input"
                  />
                </label>
              </div>
            </label>

            <label className="checkbox-label">
              <input
                id="letter-bold-body-all"
                name="boldBody"
                type="checkbox"
                checked={boldBody}
                onChange={(event) => setBoldBody(event.target.checked)}
              />
              <span>Bold the body text</span>
            </label>
          </div>

          <label className="manual-position-toggle">
            <input
              type="checkbox"
              checked={manualPositioning}
              onChange={(e) => setManualPositioning(e.target.checked)}
            />
            <span>Enable manual positioning</span>
            <button
              type="button"
              onClick={resetPositions}
              className="toggle-preview-button manual-position-reset"
            >
              Reset positions
            </button>
          </label>

          <div className="button-group">
            <button
              type="button"
              className="export-button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
            >
              {isExporting ? "Preparing PDF..." : "Make PDF"}
            </button>
            <button
              type="button"
              className="toggle-preview-button"
              onClick={() => setShowPreview(!showPreview)}
              title={
                showPreview ? "Hide letter preview" : "Show letter preview"
              }
            >
              {showPreview ? "Hide preview" : "Show preview"}
            </button>
          </div>
        </section>

        {showPreview && (
          <section className="preview-panel" aria-label="PDF letter preview">
            <div className="paper-frame paper-frame--pdf-preview">
              {previewPdfBuffer ? (
                <div
                  className={`pdf-preview-wrapper ${isDragging ? "dragging" : ""}`}
                >
                  <img
                    src={letterHeadUrl}
                    alt="Letterhead background"
                    className="pdf-preview-letterhead"
                    aria-hidden="true"
                  />
                  <LetterPdfPreview
                    pdfData={previewPdfBuffer}
                    onSheetRef={(el) => setSheetEl(el)}
                  />

                  <div className="pdf-overlay" aria-hidden={!manualPositioning}>
                    {manualPositioning && sheetEl ? (
                      <>
                        <OverlayItem
                          sheet={sheetEl}
                          x={positions.refValue.x}
                          y={positions.refValue.y}
                          width={positions.refValue.width}
                          height={positions.refValue.height}
                          anchor="left"
                          dragging={isDragging}
                          onMove={(nx, ny) =>
                            setPositions((p) => ({
                              ...p,
                              refValue: { ...p.refValue, x: nx, y: ny },
                            }))
                          }
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={() => {
                            const el =
                              document.getElementById("letter-ref-number");
                            if (el) el.focus();
                          }}
                        >
                          <div
                            className="overlay-box"
                            title={refNumber || "Ref"}
                          >
                            <div
                              className="overlay-box-content"
                              style={{ color: "#1f2937", fontSize: "12px" }}
                              dangerouslySetInnerHTML={{
                                __html: escapeHtml(refNumber || ""),
                              }}
                            />
                            <div
                              className="resize-handle tl"
                              onPointerDown={(e) =>
                                handleStartResize("refValue", "tl", e)
                              }
                            />
                            <div
                              className="resize-handle tr"
                              onPointerDown={(e) =>
                                handleStartResize("refValue", "tr", e)
                              }
                            />
                            <div
                              className="resize-handle bl"
                              onPointerDown={(e) =>
                                handleStartResize("refValue", "bl", e)
                              }
                            />
                            <div
                              className="resize-handle br"
                              onPointerDown={(e) =>
                                handleStartResize("refValue", "br", e)
                              }
                            />
                          </div>
                        </OverlayItem>

                        <OverlayItem
                          sheet={sheetEl}
                          x={positions.dateValue.x}
                          y={positions.dateValue.y}
                          width={positions.dateValue.width}
                          height={positions.dateValue.height}
                          anchor="left"
                          dragging={isDragging}
                          onMove={(nx, ny) =>
                            setPositions((p) => ({
                              ...p,
                              dateValue: { ...p.dateValue, x: nx, y: ny },
                            }))
                          }
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={() => {
                            const el = document.getElementById("letter-date");
                            if (el) el.focus();
                          }}
                        >
                          <div
                            className="overlay-box"
                            title={displayDate || "Date"}
                          >
                            <div
                              className="overlay-box-content"
                              style={{ color: "#1f2937", fontSize: "12px" }}
                              dangerouslySetInnerHTML={{
                                __html: escapeHtml(displayDate || ""),
                              }}
                            />
                            <div
                              className="resize-handle tl"
                              onPointerDown={(e) =>
                                handleStartResize("dateValue", "tl", e)
                              }
                            />
                            <div
                              className="resize-handle tr"
                              onPointerDown={(e) =>
                                handleStartResize("dateValue", "tr", e)
                              }
                            />
                            <div
                              className="resize-handle bl"
                              onPointerDown={(e) =>
                                handleStartResize("dateValue", "bl", e)
                              }
                            />
                            <div
                              className="resize-handle br"
                              onPointerDown={(e) =>
                                handleStartResize("dateValue", "br", e)
                              }
                            />
                          </div>
                        </OverlayItem>

                        <OverlayItem
                          sheet={sheetEl}
                          x={positions.heading.x}
                          y={positions.heading.y}
                          width={positions.heading.width}
                          height={positions.heading.height}
                          anchor="left"
                          dragging={isDragging}
                          onMove={(nx, ny) =>
                            setPositions((p) => ({
                              ...p,
                              heading: { ...p.heading, x: nx, y: ny },
                            }))
                          }
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={() => {
                            const el =
                              document.getElementById("letter-heading");
                            if (el) el.focus();
                          }}
                        >
                          <div
                            className="overlay-box"
                            title={heading || "Heading"}
                          >
                            <div
                              className="overlay-box-content"
                              style={{
                                color: headingColor || "#000",
                                fontSize: "20px",
                                fontWeight: 700,
                              }}
                              dangerouslySetInnerHTML={{
                                __html: escapeHtml(heading || "").replace(
                                  /\n/g,
                                  "<br>",
                                ),
                              }}
                            />
                            <div
                              className="resize-handle tl"
                              onPointerDown={(e) =>
                                handleStartResize("heading", "tl", e)
                              }
                            />
                            <div
                              className="resize-handle tr"
                              onPointerDown={(e) =>
                                handleStartResize("heading", "tr", e)
                              }
                            />
                            <div
                              className="resize-handle bl"
                              onPointerDown={(e) =>
                                handleStartResize("heading", "bl", e)
                              }
                            />
                            <div
                              className="resize-handle br"
                              onPointerDown={(e) =>
                                handleStartResize("heading", "br", e)
                              }
                            />
                          </div>
                        </OverlayItem>

                        <OverlayItem
                          sheet={sheetEl}
                          x={positions.body.x}
                          y={positions.body.y}
                          width={positions.body.width}
                          height={positions.body.height}
                          anchor="left"
                          dragging={isDragging}
                          onMove={(nx, ny) =>
                            setPositions((p) => ({
                              ...p,
                              body: { ...p.body, x: nx, y: ny },
                            }))
                          }
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onDoubleClick={() => {
                            const el = document.getElementById("letter-body");
                            if (el) el.focus();
                          }}
                        >
                          <div className="overlay-box" title={body || "Body"}>
                            <div
                              className="overlay-box-content"
                              style={{
                                color: bodyColor || "#000",
                                fontSize: "14px",
                              }}
                              dangerouslySetInnerHTML={{
                                __html: bodyToHtml(body),
                              }}
                            />
                            <div
                              className="resize-handle tl"
                              onPointerDown={(e) =>
                                handleStartResize("body", "tl", e)
                              }
                            />
                            <div
                              className="resize-handle tr"
                              onPointerDown={(e) =>
                                handleStartResize("body", "tr", e)
                              }
                            />
                            <div
                              className="resize-handle bl"
                              onPointerDown={(e) =>
                                handleStartResize("body", "bl", e)
                              }
                            />
                            <div
                              className="resize-handle br"
                              onPointerDown={(e) =>
                                handleStartResize("body", "br", e)
                              }
                            />
                          </div>
                        </OverlayItem>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="pdf-preview-loading" role="status">
                  Rendering preview…
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
