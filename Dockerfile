# queuePop Draft Sim — deployable web build (Coolify/Docker).
# The sim is pure Python stdlib: no pip install, nothing to compile.
# It only needs the engine + data + fonts, NOT the desktop app in src/.
FROM python:3.12-slim

WORKDIR /app

COPY scripts/counter_engine.py scripts/draft_sim_server.py scripts/draft_sim.html scripts/
COPY data/champion_flags.json \
     data/counter_rules.seed.json \
     data/counter_scenarios.seed.json \
     data/champion_flags.seed.json \
     data/
COPY brand/fonts/ brand/fonts/

ENV HOST=0.0.0.0 \
    PORT=8765 \
    PYTHONUNBUFFERED=1

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/healthz')" || exit 1

CMD ["python", "scripts/draft_sim_server.py"]
