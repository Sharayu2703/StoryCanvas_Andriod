import { useCallback, useEffect, useRef, useState } from "react";
import {
  Aperture, ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, ChevronRight,
  CircleHelp, Download, Eraser, ImagePlus, Instagram, LoaderCircle, Palette,
  RotateCcw, Save, Sparkles, Sticker, Trash2, Upload, Video, X
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const STICKERS = [
  { label: "IN PROGRESS", color: "#9a8cff" },
  { label: "DONE", color: "#5de0bc" },
  { label: "BLOCKED", color: "#ff8298" },
  { label: "IN REVIEW", color: "#ffc66d" },
  { label: "SHIPPED", color: "#79b9ff" }
];

export default function App() {
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const canvasRef = useRef(null);
  const baseImageRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const historyRef = useRef([]);
  const streamRef = useRef(null);
  const [mode, setMode] = useState("home");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [imageReady, setImageReady] = useState(false);
  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("My story");
  const [brushColor, setBrushColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(5);
  const [selectedTool, setSelectedTool] = useState("draw");
  const [activeSticker, setActiveSticker] = useState(null);
  const [stickerLabels, setStickerLabels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [savedId, setSavedId] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const notify = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const startCamera = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access needs a secure browser context. Use localhost or HTTPS, or upload a photo.");
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = stream;
      setCameraOn(true);
      setMode("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      setCameraError(err.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in your browser settings."
        : "Unable to start camera. Try another browser or upload a photo.");
    }
  };

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const openEditorWithImage = async (src) => {
    try {
      const img = await loadImage(src);
      baseImageRef.current = img;
      setImageReady(true);
      setCaption("");
      setStickerLabels([]);
      setSavedId("");
      historyRef.current = [];
      setMode("editor");
      requestAnimationFrame(() => drawBase(img));
    } catch {
      notify("This image could not be opened. Please try another image.");
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      notify("Camera is still starting. Please wait a moment.");
      return;
    }
    const temp = document.createElement("canvas");
    temp.width = video.videoWidth;
    temp.height = video.videoHeight;
    temp.getContext("2d").drawImage(video, 0, 0);
    const data = temp.toDataURL("image/jpeg", 0.94);
    stopCamera();
    await openEditorWithImage(data);
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Please choose an image file.");
      event.target.value = "";
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      notify("Please choose an image smaller than 15 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => openEditorWithImage(reader.result);
    reader.onerror = () => notify("Could not read that image.");
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const drawBase = (img = baseImageRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    const maxWidth = Math.max(320, Math.min(900, canvas.parentElement?.clientWidth || 640));
    const maxHeight = Math.max(500, Math.min(1300, window.innerHeight * 0.66));
    const ratio = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    if (mode !== "editor" || !imageReady) return;
    const onResize = () => {
      // Preserve current bitmap dimensions and content; avoid destructive redraw during active edits.
      const canvas = canvasRef.current;
      if (canvas && baseImageRef.current && canvas.width === 0) drawBase();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode, imageReady]);

  const pointFromEvent = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const snapshot = () => {
    const canvas = canvasRef.current;
    if (canvas) historyRef.current.push(canvas.toDataURL("image/png"));
    if (historyRef.current.length > 20) historyRef.current.shift();
  };

  const onPointerDown = (event) => {
    if (selectedTool !== "draw" || activeSticker) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    snapshot();
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(event);
  };

  const onPointerMove = (event) => {
    if (!drawingRef.current || !lastPointRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const p = pointFromEvent(event);
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize * (canvas.width / Math.max(320, canvas.getBoundingClientRect().width));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPointRef.current = p;
  };

  const onPointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const undo = async () => {
    const previous = historyRef.current.pop();
    if (!previous) { notify("Nothing to undo yet."); return; }
    const img = await loadImage(previous);
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  const clearCanvas = () => {
    if (!baseImageRef.current) return;
    snapshot();
    drawBase();
    setStickerLabels([]);
    setCaption("");
    notify("Canvas reset. Caption and stickers cleared.");
  };

  const addSticker = (sticker) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    snapshot();
    const ctx = canvas.getContext("2d");
    const scale = canvas.width / 640;
    const fontSize = Math.max(12, 15 * scale);
    ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
    const label = sticker.label;
    const padX = 14 * scale;
    const padY = 9 * scale;
    const textWidth = ctx.measureText(label).width;
    const x = canvas.width / 2;
    const y = canvas.height * (0.20 + (stickerLabels.length % 4) * 0.105);
    ctx.fillStyle = `${sticker.color}ee`;
    roundRect(ctx, x - (textWidth + padX * 2) / 2, y - fontSize - padY, textWidth + padX * 2, fontSize + padY * 2, 10 * scale);
    ctx.fill();
    ctx.fillStyle = "#0b1020";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label, x, y);
    setStickerLabels(prev => [...prev, label]);
    setActiveSticker(null);
  };

  const roundRect = (ctx, x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  };

  const getFinalDataUrl = async () => {
    const original = canvasRef.current;
    if (!original) throw new Error("Canvas is not ready.");
    const out = document.createElement("canvas");
    out.width = original.width;
    out.height = original.height;
    const ctx = out.getContext("2d");
    ctx.drawImage(original, 0, 0);
    if (caption.trim()) {
      const size = Math.max(17, out.width * 0.047);
      ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const maxTextWidth = out.width * 0.84;
      const words = caption.trim().split(/\s+/);
      const lines = [];
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width > maxTextWidth && line) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      if (line) lines.push(line);
      const lineHeight = size * 1.3;
      const padding = size * 0.65;
      const blockHeight = lines.length * lineHeight;
      const baseline = out.height - out.height * 0.105;
      ctx.fillStyle = "rgba(10,14,25,.78)";
      roundRect(ctx, out.width * 0.045, baseline - blockHeight - padding, out.width * 0.91, blockHeight + padding * 1.35, size * 0.35);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      lines.forEach((text, i) => ctx.fillText(text, out.width / 2, baseline - blockHeight + lineHeight / 2 + i * lineHeight, maxTextWidth));
    }
    return out.toDataURL("image/png");
  };

  const exportImage = async () => {
    try {
      const dataUrl = await getFinalDataUrl();
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${safeName(title)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      notify("Your edited PNG is ready.");
    } catch (err) {
      notify(err.message || "Could not export image.");
    }
  };

  const saveProject = async () => {
    setBusy(true);
    try {
      const imageDataUrl = await getFinalDataUrl();
      const response = await fetch(`${API_URL}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, caption, imageDataUrl, stickerLabels })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Save failed.");
      setSavedId(result.id);
      notify("Project saved to MongoDB.");
    } catch (err) {
      notify(err.message.includes("Failed to fetch")
        ? "Could not reach API. Start the Express server and MongoDB, then retry."
        : err.message);
    } finally {
      setBusy(false);
    }
  };

  const openInstagram = async () => {
    try {
      const dataUrl = await getFinalDataUrl();
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && navigator.share && navigator.canShare) {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "storycanvas.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          // This opens the OS share target chooser, not a guaranteed direct Stories handoff.
          await navigator.share({ files: [file], title: title || "StoryCanvas" });
          notify("Choose Instagram if it appears. Direct Stories preloading is not guaranteed on web.");
          return;
        }
      }
      if (isMobile) {
        window.location.href = "instagram://story-camera";
        window.setTimeout(() => {
          if (!document.hidden) window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
        }, 1400);
        notify("Opening Instagram if installed. This browser handoff cannot preload the image.");
      } else {
        window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
        notify("Instagram opened. Export the image first; desktop web cannot preload Stories this way.");
      }
    } catch (err) {
      if (err.name !== "AbortError") notify("Could not open Instagram. Export the image and try on a phone.");
    }
  };

  const startOver = () => {
    if (mode === "camera") stopCamera();
    setMode("home");
    setImageReady(false);
    setCaption("");
    setStickerLabels([]);
    setSavedId("");
    baseImageRef.current = null;
    historyRef.current = [];
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); startOver(); }}>
          <span className="brand-mark"><Aperture size={21}/></span>
          <span>story<span className="brand-light">canvas</span><small>CREATE IN THE MOMENT</small></span>
        </a>
        <div className="top-actions">
          <span className="status-dot"><i/> All edits stay yours</span>
          <button className="icon-button" aria-label="Help" onClick={() => setShowHelp(true)}><CircleHelp size={19}/></button>
        </div>
      </header>

      {mode === "home" && (
        <main className="home-layout">
          <section className="hero-copy">
            <div className="eyebrow"><Sparkles size={14}/> YOUR MOMENT, YOUR STORY</div>
            <h1>Make the moment<br/><em>yours.</em></h1>
            <p className="hero-description">A little drawing. A status sticker. The words you meant to say. Turn a photo into a story that feels like you.</p>
            <div className="hero-buttons">
              <button className="primary-button" onClick={startCamera}><Aperture size={18}/> Capture a photo <ChevronRight size={17}/></button>
              <button className="secondary-button" onClick={() => fileRef.current?.click()}><Upload size={17}/> Upload photo</button>
              <input ref={fileRef} className="visually-hidden" type="file" accept="image/*" onChange={handleUpload}/>
            </div>
            {cameraError && <div className="error-note">{cameraError}</div>}
            <div className="feature-row">
              <div><span className="feature-icon purple"><Palette size={17}/></span><b>Draw freely</b><small>Make it personal</small></div>
              <div><span className="feature-icon mint"><Sticker size={17}/></span><b>Status stickers</b><small>Say it visually</small></div>
              <div><span className="feature-icon peach"><Instagram size={17}/></span><b>Story-ready</b><small>Export and share</small></div>
            </div>
          </section>
          <section className="hero-art" aria-label="Example story preview">
            <div className="art-glow"/>
            <div className="floating-tag tag-top"><span className="tiny-dot"/> LITTLE MOMENTS</div>
            <div className="story-card">
              <div className="story-image">
                <div className="sun"/>
                <div className="mountain mountain-back"/>
                <div className="mountain mountain-front"/>
                <div className="story-scribble">✳</div>
                <div className="mock-sticker">ON MY WAY</div>
                <div className="story-caption">collecting<br/><i>little joys.</i></div>
                <div className="story-progress"><span/><span/><span/><span/></div>
                <div className="story-profile"><span className="avatar">s</span><b>your.story</b><small>now</small></div>
              </div>
            </div>
            <div className="floating-tag tag-bottom"><Sparkles size={14}/> Made by you, always.</div>
            <div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
          </section>
          <footer className="home-footer"><span>STORYCANVAS STUDIO</span><span>CAPTURE · CREATE · SHARE</span><span>MADE FOR THE MOMENTS THAT MATTER</span></footer>
        </main>
      )}

      {mode === "camera" && (
        <main className="camera-page">
          <div className="section-heading">
            <button className="back-link" onClick={() => { stopCamera(); setMode("home"); }}><ArrowLeft size={16}/> Back</button>
            <div><div className="eyebrow">STEP 01 / CAPTURE</div><h2>Find your moment.</h2></div>
            <span className="live-pill"><i/> LIVE CAMERA</span>
          </div>
          <div className="camera-stage">
            <video ref={videoRef} autoPlay playsInline muted className="camera-video"/>
            <div className="camera-frame"><span/><span/><span/><span/></div>
            <div className="camera-tip"><Video size={14}/> Keep your subject in frame</div>
          </div>
          <div className="camera-controls">
            <button className="secondary-button" onClick={() => { stopCamera(); setMode("home"); fileRef.current?.click(); }}><ImagePlus size={17}/> Use a photo</button>
            <button className="shutter" onClick={capturePhoto} aria-label="Take photo"><span/></button>
            <button className="secondary-button" onClick={() => { stopCamera(); setMode("home"); }}><X size={17}/> Cancel</button>
          </div>
          {cameraError && <div className="error-note">{cameraError}</div>}
        </main>
      )}

      {mode === "editor" && (
        <main className="editor-page">
          <div className="editor-heading">
            <button className="back-link" onClick={startOver}><ArrowLeft size={16}/> Start over</button>
            <div><div className="eyebrow">STEP 02 / MAKE IT YOURS</div><h2>Your canvas.</h2></div>
            <div className="editor-heading-actions">
              {savedId && <span className="saved-indicator"><Check size={14}/> Saved</span>}
              <button className="secondary-button compact" onClick={undo}><RotateCcw size={15}/> Undo</button>
            </div>
          </div>
          <div className="editor-grid">
            <section className="canvas-column">
              <div className="canvas-topline"><span><span className="tiny-dot"/> LIVE CANVAS</span><span>PNG · HIGH QUALITY</span></div>
              <div className="canvas-wrap">
                <canvas ref={canvasRef} className="photo-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{ cursor: selectedTool === "draw" ? "crosshair" : "default" }}/>
                <div className="canvas-bottom-label"><span>DRAW MODE</span><span>DRAG TO DRAW</span></div>
              </div>
              <div className="canvas-actions">
                <button className="subtle-button" onClick={clearCanvas}><Eraser size={15}/> Reset edits</button>
                <span>Tip: use two fingers to zoom your browser if needed.</span>
              </div>
            </section>
            <aside className="tools-panel">
              <div className="panel-title"><span>CREATIVE TOOLS</span><span className="step-count">02 — 04</span></div>
              <label className="field-label" htmlFor="projectTitle">STORY NAME</label>
              <input id="projectTitle" className="text-input" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="Name your story"/>
              <div className="tool-divider"/>
              <div className="tool-heading"><span className="tool-number">01</span><div><b>Freehand drawing</b><small>Leave a little mark.</small></div></div>
              <div className="color-row">
                {["#ffffff", "#9a8cff", "#5de0bc", "#ff8298", "#ffc66d", "#79b9ff", "#111827"].map(color =>
                  <button key={color} className={`color-swatch ${brushColor === color ? "selected" : ""}`} style={{ background: color }} onClick={() => setBrushColor(color)} aria-label={`Brush color ${color}`}/>
                )}
                <label className="custom-color" title="Custom color"><Palette size={15}/><input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} aria-label="Custom brush color"/></label>
              </div>
              <div className="range-label"><label htmlFor="brushSize">Brush size</label><b>{brushSize}px</b></div>
              <input id="brushSize" type="range" min="2" max="18" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))}/>
              <div className="tool-divider"/>
              <div className="tool-heading"><span className="tool-number">02</span><div><b>Status stickers</b><small>Choose your current vibe.</small></div></div>
              <div className="sticker-list">
                {STICKERS.map(sticker => <button key={sticker.label} className="sticker-chip" onClick={() => addSticker(sticker)}><span style={{ background: sticker.color }}/>{sticker.label}<ChevronRight size={14}/></button>)}
              </div>
              <div className="tool-divider"/>
              <div className="tool-heading"><span className="tool-number">03</span><div><b>Add your words</b><small>Caption is included in export.</small></div></div>
              <textarea className="caption-input" value={caption} maxLength={500} onChange={e => setCaption(e.target.value)} placeholder="A thought, a feeling, a little update…" rows={3}/>
              <div className="caption-footer"><span>Rendered onto image</span><span>{caption.length}/500</span></div>
              <div className="tool-divider"/>
              <div className="export-buttons">
                <button className="primary-button full" onClick={exportImage}><Download size={17}/> Export PNG</button>
                <button className="secondary-button full" onClick={saveProject} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <Save size={17}/>} {busy ? "Saving project…" : "Save project"}</button>
                <button className="instagram-button full" onClick={openInstagram}><Instagram size={17}/> Open Instagram <ArrowUpRight size={16}/></button>
              </div>
              <p className="share-note">Instagram's browser handoff cannot guarantee direct Stories preloading. Export your image first for the most reliable result.</p>
            </aside>
          </div>
        </main>
      )}

      <footer className="global-footer"><span>© 2026 STORYCANVAS</span><span>YOUR MOMENT. YOUR CREATION.</span><button onClick={() => setShowHelp(true)}>How it works <ArrowUpRight size={12}/></button></footer>

      {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
      {showHelp && <div className="modal-backdrop" onClick={() => setShowHelp(false)}><div className="help-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowHelp(false)}><X size={18}/></button><div className="eyebrow">QUICK GUIDE</div><h2>From camera to canvas.</h2><ol><li><b>Capture or upload.</b><span>Use your camera on localhost/HTTPS or pick an image.</span></li><li><b>Make it yours.</b><span>Drag to draw, add status stickers, and write a caption.</span></li><li><b>Export or save.</b><span>Export downloads a PNG. Save project stores it in MongoDB.</span></li><li><b>Share to Instagram.</b><span>Web browsers cannot reliably preload a local image into Stories. Export the image, then use Instagram's own Story composer.</span></li></ol><button className="primary-button full" onClick={() => setShowHelp(false)}>Got it <Check size={16}/></button></div></div>}
    </div>
  );
}

function safeName(value) {
  return (value || "storycanvas").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "storycanvas";
}
