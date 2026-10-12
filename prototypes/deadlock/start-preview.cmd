@echo off
cd /d "%~dp0"
echo QueuePop Deadlock preview: http://127.0.0.1:4317/
echo Keep this window open while using the preview. Press Ctrl+C to stop.
py -m http.server 4317 --bind 127.0.0.1
