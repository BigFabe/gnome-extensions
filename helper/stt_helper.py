#!/usr/bin/env python3
"""Record push-to-talk audio and transcribe it locally with Parakeet TDT."""

from __future__ import annotations

import argparse
from array import array
import json
import os
import queue
import re
import subprocess
import sys
import tempfile
import threading
import wave
from pathlib import Path
from typing import Any

SAMPLE_RATE = 16_000
AUDIO_CHUNK = 8_000
MIN_AUDIO_BYTES = SAMPLE_RATE * 2 // 2
SPEECH_THRESHOLD = 250
SPEECH_CHUNKS = 2


def emit(event_type: str, **values: Any) -> None:
    print(json.dumps({"type": event_type, **values}, ensure_ascii=False), flush=True)


class SpeechWorker:
    def __init__(self, cli: Path, model: Path, threads: int) -> None:
        self.cli = cli
        self.model = model
        self.threads = threads
        self.process: subprocess.Popen[bytes] | None = None
        self.transcriber: subprocess.Popen[str] | None = None
        self.thread: threading.Thread | None = None
        self.stop_event = threading.Event()
        self.quit_event = threading.Event()
        self.lock = threading.Lock()

    def start(self, source: str = "") -> None:
        with self.lock:
            if self.thread and self.thread.is_alive():
                emit("error", message="Die vorherige Transkription läuft noch.")
                return
            self.stop_event.clear()
            self.thread = threading.Thread(
                target=self._record_and_transcribe,
                args=(source,),
                name="parakeet-transcriber",
                daemon=True,
            )
            self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        process = self.process
        if process and process.poll() is None:
            process.terminate()

    def quit(self) -> None:
        self.quit_event.set()
        self.stop()
        transcriber = self.transcriber
        if transcriber and transcriber.poll() is None:
            transcriber.terminate()

    def join(self, timeout: float = 3.0) -> None:
        thread = self.thread
        if thread:
            thread.join(timeout)

    def _record_and_transcribe(self, source: str) -> None:
        fd, filename = tempfile.mkstemp(prefix="gnome-stt-", suffix=".wav")
        os.close(fd)
        audio_path = Path(filename)
        audio_bytes = 0
        speech_chunks = 0
        speech_seen = False
        command = [
            "parec",
            "--raw",
            f"--rate={SAMPLE_RATE}",
            "--format=s16le",
            "--channels=1",
            "--latency-msec=60",
            "--client-name=GNOME Push-to-Talk STT",
            "--stream-name=Parakeet speech recognition",
        ]
        if source:
            command.append(f"--device={source}")

        try:
            self.process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=0,
            )
            emit("recording")
            assert self.process.stdout is not None

            with wave.open(str(audio_path), "wb") as audio_file:
                audio_file.setnchannels(1)
                audio_file.setsampwidth(2)
                audio_file.setframerate(SAMPLE_RATE)
                while not self.stop_event.is_set():
                    data = self.process.stdout.read(AUDIO_CHUNK)
                    if not data:
                        break
                    audio_file.writeframesraw(data)
                    audio_bytes += len(data)

                    samples = array('h')
                    samples.frombytes(data[:len(data) - len(data) % 2])
                    if sys.byteorder != 'little':
                        samples.byteswap()
                    mean_amplitude = sum(abs(sample) for sample in samples) / max(1, len(samples))
                    if mean_amplitude >= SPEECH_THRESHOLD:
                        speech_chunks += 1
                        if speech_chunks >= SPEECH_CHUNKS:
                            speech_seen = True
                    elif not speech_seen:
                        speech_chunks = 0

            if (self.quit_event.is_set() or not speech_seen or
                    audio_bytes < MIN_AUDIO_BYTES):
                return

            emit("processing")
            command = [
                str(self.cli),
                "--model", str(self.model),
                "--file", str(audio_path),
                "--threads", str(self.threads),
                "--no-prints",
            ]
            stdout, stderr, returncode = self._transcribe(command)
            if self.quit_event.is_set():
                return

            if returncode != 0:
                emit("error", message=self._format_transcriber_error(returncode, stderr))
                return

            text = re.sub(r"\s+", " ", stdout).strip()
            if text:
                emit("final", text=text)
        except FileNotFoundError as error:
            emit("error", message=f"Programm nicht gefunden: {error.filename}")
        except Exception as error:
            emit("error", message=f"Audio/Parakeet-Fehler: {error}")
        finally:
            process = self.process
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    process.kill()
            self.process = None
            self.transcriber = None
            audio_path.unlink(missing_ok=True)
            if not self.quit_event.is_set():
                emit("stopped")

    def _transcribe(self, command: list[str]) -> tuple[str, str, int]:
        environment = os.environ.copy()
        # GGML otherwise segfaults in its graph allocator when CUDA VRAM is
        # tight. Unified memory keeps CUDA active and spills only excess
        # allocations into system memory.
        environment.setdefault("GGML_CUDA_ENABLE_UNIFIED_MEMORY", "1")
        self.transcriber = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            env=environment,
        )
        stdout, stderr = self.transcriber.communicate()
        return stdout, stderr, self.transcriber.returncode

    @staticmethod
    def _format_transcriber_error(returncode: int, stderr: str) -> str:
        lines = [
            line.strip() for line in stderr.splitlines()
            if line.strip() and not line.startswith(("load_backend:", "ggml_cuda_init:"))
        ]
        if returncode < 0:
            reason = f"durch Signal {-returncode} beendet"
        else:
            reason = f"Exit-Code {returncode}"
        detail = lines[-1] if lines else reason
        return f"Parakeet-Fehler ({reason}): {detail}"


def command_reader(commands: queue.Queue[dict[str, Any]]) -> None:
    for line in sys.stdin:
        try:
            commands.put(json.loads(line))
        except json.JSONDecodeError:
            emit("error", message="Ungültiger Befehl an den STT-Helfer.")
    commands.put({"command": "quit"})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cli", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--threads", type=int, default=min(8, os.cpu_count() or 4))
    args = parser.parse_args()

    cli = Path(os.path.expanduser(args.cli))
    model = Path(os.path.expanduser(args.model))
    if not cli.is_file():
        emit("error", message=f"parakeet-cli fehlt: {cli}. Bitte whisper-cpp installieren.")
        return 2
    if not model.is_file():
        emit("error", message=f"Parakeet-Modell fehlt: {model}. Bitte ./install.sh ausführen.")
        return 2

    commands: queue.Queue[dict[str, Any]] = queue.Queue()
    threading.Thread(target=command_reader, args=(commands,), daemon=True).start()
    worker = SpeechWorker(cli, model, max(1, args.threads))
    emit("ready")

    while True:
        message = commands.get()
        command = message.get("command")
        if command == "start":
            worker.start(str(message.get("source", "")))
        elif command == "stop":
            worker.stop()
        elif command == "quit":
            worker.quit()
            worker.join()
            return 0


if __name__ == "__main__":
    raise SystemExit(main())
