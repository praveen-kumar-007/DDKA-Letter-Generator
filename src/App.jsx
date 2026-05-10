import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";

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

export default function App() {
  const letterRef = useRef(null);
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
  const [showPreview, setShowPreview] = useState(true);
  const [selectedWordColor, setSelectedWordColor] = useState("#FF6B6B");

  const displayDate = useMemo(() => formatDisplayDate(dateValue), [dateValue]);
  const isLoginConfigured = Boolean(expectedLoginId && expectedLoginPassword);

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
      }),
    );
  }, [refNumber, dateValue, heading, body, boldBody, headingColor, bodyColor]);

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

  const layout = {
    refValue: { x: 29.2, y: 23.5 },
    dateValue: { x: 80.0, y: 22.0 },
    heading: { x: 25.0, y: 29.5, width: 70 },
    body: { x: 25.0, y: 37.5, width: 70 },
  };

  const handleDownloadPdf = async () => {
    if (!letterRef.current || isExporting) return;

    setIsExporting(true);
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(letterHeadUrl, "JPEG", 0, 0, pageWidth, pageHeight);

      const toX = (percent) => (pageWidth * percent) / 100;
      const toY = (percent) => (pageHeight * percent) / 100;
      const toW = (percent) => (pageWidth * percent) / 100;
      const contentWidth = toW(layout.body.width);

      pdf.setTextColor(31, 41, 55);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12.5);
      pdf.text(
        refNumber || "23/26",
        toX(layout.refValue.x),
        toY(layout.refValue.y),
      );
      pdf.text(
        displayDate || "",
        toX(layout.dateValue.x),
        toY(layout.dateValue.y),
      );

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      const headingColorHex = headingColor.substring(1);
      const headingR = parseInt(headingColorHex.substring(0, 2), 16);
      const headingG = parseInt(headingColorHex.substring(2, 4), 16);
      const headingB = parseInt(headingColorHex.substring(4, 6), 16);
      pdf.setTextColor(headingR, headingG, headingB);
      const headingLines = pdf.splitTextToSize(heading, contentWidth);
      pdf.text(headingLines, toX(layout.heading.x), toY(layout.heading.y));

      pdf.setFontSize(11);
      const bodyPartsWithColor = parseTextWithColors(body);
      let currentY = toY(layout.body.y);
      const lineHeight = 7;

      bodyPartsWithColor.forEach((part) => {
        pdf.setFont("helvetica", part.bold ? "bold" : "normal");
        let color = part.color || bodyColor;
        const colorHex = color.substring(1);
        const r = parseInt(colorHex.substring(0, 2), 16);
        const g = parseInt(colorHex.substring(2, 4), 16);
        const b = parseInt(colorHex.substring(4, 6), 16);
        pdf.setTextColor(r, g, b);
        const partLines = pdf.splitTextToSize(part.text, contentWidth);
        partLines.forEach((line) => {
          pdf.text(line, toX(layout.body.x), currentY);
          currentY += lineHeight;
        });
      });

      pdf.save("letter.pdf");
    } catch (error) {
      // Silently handle error in production, but ensure UI recovery
      setIsExporting(false);
      throw error;
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="app-shell">
      <main className="workspace">
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
              title={showPreview ? "Hide preview" : "Show preview"}
            >
              {showPreview ? "Hide" : "Show"}
            </button>
          </div>
        </section>

        {showPreview && (
          <section className="preview-panel">
            <div className="paper-frame">
              <article className="letter-paper" ref={letterRef}>
                <img
                  src={letterHeadUrl}
                  alt="Letter head"
                  className="letter-head-image"
                />

                <div className="letter-overlay">
                  <div
                    className="overlay-value overlay-ref"
                    style={{
                      left: `${layout.refValue.x}%`,
                      top: `${layout.refValue.y}%`,
                    }}
                  >
                    <strong>{refNumber || "23/26"}</strong>
                  </div>

                  <div
                    className="overlay-value overlay-date"
                    style={{
                      left: `${layout.dateValue.x}%`,
                      top: `${layout.dateValue.y}%`,
                    }}
                  >
                    <strong>{displayDate}</strong>
                  </div>

                  <div
                    className="overlay-content"
                    style={{
                      left: `${layout.heading.x}%`,
                      top: `${layout.heading.y}%`,
                      width: `${layout.body.width}%`,
                    }}
                  >
                    <h2 style={{ color: headingColor }}>{heading}</h2>
                    <p
                      style={{
                        fontWeight: boldBody ? "bold" : "normal",
                        color: bodyColor,
                      }}
                    >
                      {parseTextWithColors(body).map((part, index) => (
                        <span
                          key={index}
                          style={{
                            fontWeight: part.bold ? "bold" : "inherit",
                            color: part.color || bodyColor,
                          }}
                        >
                          {part.text}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              </article>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
