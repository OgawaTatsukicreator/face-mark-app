"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

type CameraInputProps = {
  onFiles: (files: File[]) => Promise<void> | void;
  disabled?: boolean;
  t: (ja: string, en: string) => string;
};

const CAMERA_ERRORS = {
  insecure: ["カメラにはHTTPSまたはlocalhostが必要です。画像を選ぶボタンから写真を追加できます。", "The camera needs HTTPS or localhost. You can add a photo using Choose images."],
  unsupported: ["このブラウザではカメラを使えません。画像を選ぶボタンから写真を追加してください。", "The camera is unavailable in this browser. Please use Choose images instead."],
  denied: ["カメラの使用が許可されませんでした。ブラウザの権限設定を確認するか、画像を選んでください。", "Camera access was not allowed. Check browser permissions or choose an image instead."],
  missing: ["利用できるカメラが見つかりません。カメラを接続するか、画像を選んでください。", "No available camera was found. Connect a camera or choose an image instead."],
  start: ["カメラを開始できませんでした。他のアプリで使用していないか確認するか、画像を選んでください。", "The camera could not start. Check whether another app is using it, or choose an image instead."],
  capture: ["撮影した画像を追加できませんでした。もう一度撮影するか、画像を選んでください。", "The captured image could not be added. Try taking another photo or choose an image instead."],
} as const;

export default function CameraInput({ onFiles, disabled = false, t }: CameraInputProps) {
  const panelId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const latest = useRef({ onFiles, disabled });
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<keyof typeof CAMERA_ERRORS | null>(null);
  const [previousDisabled, setPreviousDisabled] = useState(disabled);

  // Reset presentation during the prop transition; device cleanup happens after commit.
  if (previousDisabled !== disabled) {
    setPreviousDisabled(disabled);
    if (disabled) {
      setOpen(false);
      setPending(false);
      setReady(false);
      setCapturing(false);
    }
  }

  const stopCamera = useCallback(() => {
    generation.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const closeCamera = useCallback(() => {
    stopCamera();
    busyRef.current = false;
    setOpen(false);
    setPending(false);
    setReady(false);
    setCapturing(false);
  }, [stopCamera]);

  useEffect(() => {
    mounted.current = true;
    window.addEventListener("pagehide", stopCamera);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", stopCamera);
      stopCamera();
    };
  }, [stopCamera]);

  useLayoutEffect(() => {
    latest.current = { onFiles, disabled };
    if (disabled) {
      stopCamera();
      busyRef.current = false;
    }
  }, [onFiles, disabled, stopCamera]);

  function isCurrent(token: number) {
    return mounted.current && generation.current === token && !latest.current.disabled;
  }

  async function openCamera() {
    if (disabled || latest.current.disabled || busyRef.current || streamRef.current) return;
    setError(null);
    if (!window.isSecureContext) {
      setError("insecure");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      return;
    }
    busyRef.current = true;
    const token = ++generation.current;
    setOpen(true);
    setPending(true);
    setReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      // Permission may resolve after Cancel, a disabled transition, or unmount.
      if (!isCurrent(token)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        // The permission promise can resolve before React mounts the panel.
        // Its video ref attaches the stream when the element becomes available.
        setPending(false);
        return;
      }
      video.srcObject = stream;
      await video.play();
      if (isCurrent(token)) {
        setPending(false);
        setReady(video.videoWidth > 0 && video.videoHeight > 0);
      }
    } catch (cause) {
      if (!isCurrent(token)) return;
      const name = cause instanceof DOMException ? cause.name : "";
      const message = name === "NotAllowedError" || name === "SecurityError"
        ? "denied"
        : name === "NotFoundError" || name === "OverconstrainedError"
          ? "missing"
          : "start";
      closeCamera();
      setError(message);
    } finally {
      if (isCurrent(token)) busyRef.current = false;
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (disabled || latest.current.disabled || busyRef.current || !ready || !video ||
      !streamRef.current || video.videoWidth < 1 || video.videoHeight < 1) return;
    busyRef.current = true;
    setCapturing(true);
    setError(null);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    let token = generation.current;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("CANVAS_UNAVAILABLE");
      context.drawImage(video, 0, 0);
      // The captured pixels are sufficient; do not keep the device running while encoding.
      stopCamera();
      token = generation.current;
      setOpen(false);
      setReady(false);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!isCurrent(token)) return;
      if (!blob) throw new Error("CAPTURE_UNAVAILABLE");
      await latest.current.onFiles([new File([blob], `camera-${Date.now()}.png`, { type: "image/png" })]);
    } catch {
      if (!isCurrent(token)) return;
      stopCamera();
      token = generation.current;
      setOpen(false);
      setReady(false);
      setError("capture");
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      if (isCurrent(token)) {
        busyRef.current = false;
        setCapturing(false);
      }
    }
  }

  return (
    <div className="camera-input">
      <button
        type="button"
        onClick={openCamera}
        disabled={disabled || open || capturing}
        aria-expanded={open && !disabled}
        aria-controls={panelId}
      >
        {capturing ? t("画像を準備中…", "Preparing photo…") : t("カメラで撮る", "Take a photo")}
      </button>
      {open && !disabled && (
        <section id={panelId} className="camera-panel" aria-label={t("カメラ撮影", "Camera capture")}>
          <p>{t("撮影するまで画像は追加されません。", "No image is added until you take a photo.")}</p>
          <video
            ref={(video) => {
              videoRef.current = video;
              if (video && streamRef.current && video.srcObject !== streamRef.current) video.srcObject = streamRef.current;
            }}
            autoPlay
            muted
            playsInline
            aria-label={t("カメラのプレビュー", "Camera preview")}
            onLoadedData={() => {
              const video = videoRef.current;
              if (streamRef.current && video && !latest.current.disabled) {
                setReady(video.videoWidth > 0 && video.videoHeight > 0);
              }
            }}
            style={{ display: "block", width: "100%", maxWidth: 640, maxHeight: "50vh", objectFit: "contain" }}
          />
          {pending && <p role="status">{t("カメラを待っています。権限の確認中でも取消できます。", "Waiting for the camera. You can cancel while permission is pending.")}</p>}
          <div className="button-row">
            <button type="button" onClick={capture} disabled={!ready || pending || capturing || disabled}>
              {t("撮影して追加", "Capture and add")}
            </button>
            <button type="button" onClick={closeCamera}>{t("カメラを閉じる", "Close camera")}</button>
          </div>
        </section>
      )}
      {error && <p role="alert">{t(CAMERA_ERRORS[error][0], CAMERA_ERRORS[error][1])}</p>}
    </div>
  );
}
