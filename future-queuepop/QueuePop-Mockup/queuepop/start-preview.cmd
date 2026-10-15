@echo off
cd /d "%~dp0.."
echo QueuePop concept: http://127.0.0.1:4318/queuepop/
echo Keep this window open. Press Ctrl+C to stop the preview.
py -m http.server 4318 --bind 127.0.0.1
