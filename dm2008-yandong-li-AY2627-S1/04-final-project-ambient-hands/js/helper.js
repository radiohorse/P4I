// This file contains additional helper functions
// DO NOT EDIT unless you need to

document.addEventListener("DOMContentLoaded", init);

// INITIALIZATION
function init() {
  // Only window receives resize events
  window.addEventListener("resize", viewportResized);
  setupCursorHideBehavior();
  console.info("Helper functions initialized.");
}

// HIDE CURSOR
function setupCursorHideBehavior() {
  let hideTimeout;
  const hideDelay = 5_000; // ms of inactivity before hiding

  function showCursor() {
    document.body.classList.remove("cursor-hidden");
  }

  function hideCursor() {
    document.body.classList.add("cursor-hidden");
  }

  function resetCursorTimer() {
    clearTimeout(hideTimeout);
    showCursor();
    hideTimeout = setTimeout(hideCursor, hideDelay);
  }

  // Reset timer on any mouse movement or click
  window.addEventListener("mousemove", resetCursorTimer);
  window.addEventListener("mousedown", resetCursorTimer);
  window.addEventListener("keydown", resetCursorTimer);

  // Kick things off
  resetCursorTimer();
}

// RESIZE HANDLING
let _isFullscreenCanvas;

function viewportResized() {
  // Ensure p5 globals are available before doing anything
  if (
    typeof window.resizeCanvas !== "function" ||
    typeof window.windowWidth === "undefined" ||
    typeof window.width === "undefined"
  ) {
    return;
  }

  // Decide if current canvas seems like it was made full-window?
  if (_isFullscreenCanvas === undefined) {
    _isFullscreenCanvas = width === windowWidth && height === windowHeight;
  }
  if (_isFullscreenCanvas) {
    // p5 updates windowWidth/windowHeight in its own resize listener, which runs
    // after this one — wait a frame so we resize to the new size, not the old one
    requestAnimationFrame(() => resizeCanvas(windowWidth, windowHeight));
  }
}
