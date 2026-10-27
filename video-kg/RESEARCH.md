# Research Foundations — Video → Knowledge Graph

This implementation is grounded in the papers cited in the project spec
(`Video_KG_MVP_Technical_Specification.docx`, §2 "Research-Grounded Decisions").
This doc summarizes each paper's core idea and how it shaped the build — and is
explicit about where we keep the *principle* but swap the *mechanism*.

> Note: descriptions are summarized from the spec + domain knowledge. Confirm
> exact authors/venues against the spec's own reference list before citing.

## Papers and their influence

| Paper | Core idea | How it shaped this implementation |
|---|---|---|
| **Action Genome** (Ji et al., CVPR 2020) | An activity is a *composition of spatio-temporal scene graphs*; actions decompose into per-moment object–relationship graphs over time. | We model the video as discrete, timestamped **`Event`** nodes linked to their actor/objects (`ACTOR`, `OBJECT` edges) — i.e. activity decomposed into a temporal scene graph rather than one monolithic label. |
| **TRACE** — Target Adaptive Context Aggregation for Video SGG (Teng et al., ICCV 2021) | Aggregate **temporal context across frames** for stable relation prediction; relations shouldn't be judged frame-by-frame in isolation. | Frames are grouped into **temporal windows** (scene-cut driven) and analyzed with surrounding context; events are linked in time via the **`NEXT_EVENT`** chain. |
| **TCDSG** — Temporally Consistent Dynamic Scene Graphs (tracklet-based) | Keep **consistent entity identities** (subjects/objects) across frames so relationships persist temporally. | **Entity persistence**: each person carries a stable `trackId` across windows. (We achieve this via LLM-assisted reconciliation rather than tracklets — see deviations.) |
| **PVSG** — Panoptic Video Scene Graph Generation (Yang et al., CVPR 2023) | Temporal scene graphs need **grounding** and **entity persistence** over long video. | Every `Event` stores **`evidenceFrames`** (the frames that justify it) for grounding, and entities persist across the timeline. |
| **VideoRAG** — Retrieval-Augmented Generation over video | **Retrieval scales better than stuffing whole videos into an LLM**; index the content and retrieve what's relevant per question. | The **GraphRAG query layer** (`src/query/graphRag.ts`): we build a compact temporal KG once, then retrieve/reason over *that* at query time — we never re-send the video/frames to answer a question. |

## Design principles we inherited

1. **Decompose video into a temporal scene graph** (Action Genome) — people, objects, locations, and timestamped events with relations.
2. **Use temporal context, not isolated frames** (TRACE) — window-level analysis + `NEXT_EVENT` ordering.
3. **Persist entity identity over time** (TCDSG / PVSG) — stable `trackId`.
4. **Ground claims in evidence** (PVSG) — evidence frames + timestamps on every event.
5. **Answer by retrieval over the graph, not over raw video** (VideoRAG) — GraphRAG.

## Where we deviate (and why)

The spec's §2 conclusion was "pretrained **detection + tracking** + event extraction + KG + retrieval" (YOLO + ByteTrack + PySceneDetect). Per the approved plan and project constraints (Apple M1, no GPU, reuse existing OpenAI), we substitute mechanisms while keeping the principles:

| Research mechanism | What we use instead | Trade-off |
|---|---|---|
| YOLO object detection | **Hosted multimodal vision (OpenAI gpt-5)** per window | No GPU/training; broad open-vocabulary recognition, but no hard detection boxes/recall guarantees. |
| ByteTrack multi-object tracking (TCDSG/TRACE ideal) | **LLM-assisted appearance reconciliation** across windows | Far simpler; weaker identity guarantees in crowded/fast scenes (the main quality risk). |
| PySceneDetect | **ffmpeg scene filter** (`select='gt(scene,t)'`) | One dependency instead of a Python stack. |

These trade-offs are the documented MVP stance: honor the research's *temporal-scene-graph + persistence + grounding + retrieval* principles, but reach them with a hosted-LLM pipeline rather than a local CV/tracking stack.

## Pipeline ↔ research mapping

| Module | Research principle |
|---|---|
| `pipeline/sceneDetect.ts` (windows) | Temporal decomposition (Action Genome / TRACE) |
| `vision/visionClient.ts` (per-window VLM) | Spatio-temporal scene-graph extraction (Action Genome / PVSG) |
| `vision/entityReconciler.ts` (`trackId`) | Temporal entity persistence (TCDSG / PVSG) |
| `graph/graphBuilder.ts` (`Event` + `ACTOR`/`OBJECT`/`AT_LOCATION`/`NEXT_EVENT`) | Temporal scene graph (Action Genome) |
| `evidenceFrames` on events | Grounding (PVSG) |
| `query/graphRag.ts` | Retrieval-augmented QA over the graph (VideoRAG) |
