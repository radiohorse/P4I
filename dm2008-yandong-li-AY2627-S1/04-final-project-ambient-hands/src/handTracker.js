// Own the camera and ml5 lifecycle. Pass raw results to the gesture mapper through onResults.
// p is the existing p5 runtime (window in global mode), supplied by src/sketch.js.
export function createHandTracker(p, { onResults, onStatus, ml5Library = globalThis.ml5 }) {
  let video;
  let handPose;
  let cameraReady = false;
  let handModelReady = false;
  let handTrackingStarted = false;
  let cameraTimeout;
  let stopped = false;

  function startCamera() {
    onStatus("Starting camera…");
    try {
      video = p.createCapture(p.VIDEO, () => {
        if (stopped) return;
        cameraReady = true;
        startHandTracking();
      });
      video.hide(); // visuals.js draws the video on the canvas.
      cameraTimeout = setTimeout(() => {
        if (!stopped && !cameraReady) onStatus("Camera unavailable");
      }, 10000);
    } catch (error) {
      console.error("Unable to start camera:", error);
      onStatus("Camera unavailable");
    }
  }

  async function startHandModel() {
    if (!ml5Library) {
      onStatus("Hand tracking unavailable");
      return;
    }
    try {
      // With p5 2.x, await the model returned by ml5 before calling detectStart().
      // flipped mirrors keypoints to match the mirrored camera drawing.
      handPose = await ml5Library.handPose({ maxHands: 2, flipped: true });
      if (handPose.ready) await handPose.ready;
    } catch (error) {
      console.error("Unable to load the hand model:", error);
      if (!stopped) onStatus("Hand tracking unavailable");
      return;
    }
    if (stopped) return;
    handModelReady = true;
    startHandTracking();
  }

  function startHandTracking() {
    if (stopped || !cameraReady || !handModelReady || handTrackingStarted) return;
    handTrackingStarted = true;
    onStatus("");
    handPose.detectStart(video, results => onResults(results, p.millis(), video.height));
  }

  function start() {
    stopped = false;
    startCamera();
    startHandModel(); // Camera and model load independently, as in the original sketch.
  }

  function stop() {
    stopped = true;
    clearTimeout(cameraTimeout);
    if (handTrackingStarted) handPose.detectStop();
    video?.elt?.srcObject?.getTracks().forEach(track => track.stop());
    video?.remove();
    cameraReady = false;
    handTrackingStarted = false;
  }

  return {
    start, stop,
    get video() { return video; },
    get cameraReady() { return cameraReady; },
    get handModelReady() { return handModelReady; },
    get handTrackingStarted() { return handTrackingStarted; },
  };
}
