# Known limitations

* **Campaign length is unmeasured.** The scripted solver completes the six chapters in roughly 4–6 minutes of
  simulated play; no human playtests have been run, so the "3–5 hours" figure in the brief has **not** been verified.
  Expect a first-time player to take longer than the bot, but this repository does not claim a duration.
* Rendering was verified in software-rendered (SwiftShader) Chromium only, at Low quality in the e2e run; High/Ultra
  paths (GTAO, MSAA 4×, 4096 shadows) are implemented but were not benchmarked on real GPUs. Frame rates on real hardware are unmeasured.
* Audio was verified for non-silent output and voice management only (no human listening pass or loudness tuning).
* Physics is AABB-based (no rotated or rolling bodies); mirrors reflect only on the horizontal plane at 45°.
* Echo bodies are kinematic: present objects cannot push them (they push and carry present objects).
* Only one recording can be captured at a time.
* Gamepad and touch input are not supported.
* Saves live in `localStorage` (5 MB browser limit); long recordings in many slots may not fit and the game says so.
