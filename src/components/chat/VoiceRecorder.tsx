import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { Mic, Square, Play, Pause, Trash2, Send } from 'lucide-react';
import { Button } from '../ui/Button';

interface VoiceRecorderProps {
  onSendVoice: (blob: Blob, durationSeconds: number) => void;
  onCancel?: () => void;
  autoStart?: boolean;
}

export const VoiceRecorder = forwardRef(({ onSendVoice, onCancel, autoStart = true }: VoiceRecorderProps, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording
  }));

  const startRecording = async () => {
    try {
      // Explicitly request browser mic permission first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access error details:', err);
      alert(`Microphone access issue: ${err.name} - ${err.message}. Please check browser settings and allow microphone access.`);
      if (onCancel) onCancel();
    }
  };

  React.useEffect(() => {
    if (autoStart) {
      startRecording();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleSend = () => {
    if (audioBlob) {
      onSendVoice(audioBlob, recordingTime);
      resetRecorder();
    }
  };

  const resetRecorder = () => {
    setIsRecording(false);
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordingTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    if (onCancel) onCancel();
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current || !audioUrl) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
      {isRecording && (
        <div className="flex items-center gap-3 w-full justify-between">
          <div className="flex items-center gap-2 text-rose-500 animate-pulse font-mono text-xs font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span>در حال ضبط: {formatTime(recordingTime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="xs" onClick={resetRecorder} leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-500" />}>
              لغو
            </Button>
            <Button variant="danger" size="xs" onClick={stopRecording} leftIcon={<Square className="w-3.5 h-3.5" />}>
              پایان ضبط
            </Button>
          </div>
        </div>
      )}

      {audioUrl && !isRecording && (
        <div className="flex items-center gap-3 w-full justify-between">
          <audio
            ref={audioPlayerRef}
            src={audioUrl}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlayback}
              className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
              {formatTime(recordingTime)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="xs" onClick={resetRecorder} leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-500" />}>
              حذف
            </Button>
            <Button variant="success" size="xs" onClick={handleSend} leftIcon={<Send className="w-3.5 h-3.5" />}>
              ارسال پیام صوتی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
