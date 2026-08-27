#!/usr/bin/env bash
# CPU-machine preparation on the Lightning Studio (no GPU minutes).
# Run from ai/src/ai after filling eval/docker/.env.eval:
#   bash eval/docker/prep.sh data      # MIMIC-IV demo on FHIR + FHIR-AgentBench
#   bash eval/docker/prep.sh weights   # MedGemma 27B text + 4B into the HF cache
#   bash eval/docker/prep.sh images    # build runner/mcp, pull qdrant/phoenix/sglang
#   bash eval/docker/prep.sh index     # embed + index all 100 patients, snapshot
#   bash eval/docker/prep.sh study     # retrieval study (no LLM) + gate calibration
set -euo pipefail

cd "$(dirname "$0")/../.."
ENV_FILE=eval/docker/.env.eval
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy .env.eval.example)"; exit 1; }
set -a; . "$ENV_FILE"; set +a
: "${EVAL_HOME:?}"
COMPOSE=(docker compose -f eval/docker/docker-compose.eval.yml --env-file "$ENV_FILE")
mkdir -p "$EVAL_HOME"/{data,cache/hf,cache/fastembed,cache/mcp_http,qdrant/storage,qdrant/snapshots,phoenix,results/eval-v1}

case "${1:-}" in
  data)
    cd "$EVAL_HOME/data"
    if [ ! -d mimic/fhir ]; then
      curl -fSL -o mimic-demo.zip https://physionet.org/content/mimic-iv-fhir-demo/get-zip/2.1.0/
      unzip -q mimic-demo.zip && mkdir -p mimic && mv mimic-iv-clinical-database-demo-on-fhir-2.1.0/fhir mimic/fhir
      rm -rf mimic-demo.zip mimic-iv-clinical-database-demo-on-fhir-2.1.0
    fi
    [ -d FHIR-AgentBench ] || git clone --depth 1 https://github.com/glee4810/FHIR-AgentBench.git
    ls mimic/fhir | wc -l | xargs echo "NDJSON files:"
    ;;
  weights)
    python3 -m pip install -q "huggingface_hub[cli]"
    export HF_HOME="$EVAL_HOME/cache/hf"
    for m in google/medgemma-27b-text-it google/medgemma-4b-it; do
      hf download "$m" --token "$HF_TOKEN" --exclude "*.gguf" "original/*"
    done
    du -sh "$HF_HOME"
    ;;
  images)
    GIT_SHA=$(git rev-parse --short HEAD) "${COMPOSE[@]}" --profile eval --profile prep build
    docker pull qdrant/qdrant:v1.7.4
    docker pull arizephoenix/phoenix:version-20.16.0
    docker pull "${SGLANG_IMAGE:-lmsysorg/sglang:v0.5.20-runtime}"
    ;;
  index)
    "${COMPOSE[@]}" --profile prep up -d qdrant
    "${COMPOSE[@]}" --profile prep run --rm indexer
    ;;
  study)
    "${COMPOSE[@]}" --profile prep up -d qdrant
    "${COMPOSE[@]}" --profile prep run --rm indexer eval/retrieval_study.py --resume
    ;;
  *)
    sed -n '2,9p' "$0"; exit 1
    ;;
esac
