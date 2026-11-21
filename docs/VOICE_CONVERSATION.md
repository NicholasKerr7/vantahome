# Hey Vanta conversational controls

Implemented November 20, 2026 for Preview 114; correction reliability updated
November 21 for Preview 115. Simulation only; no provider,
server, hub, or physical-device control changes.

## Interaction

After a completed comfort command, Vanta remembers its permitted targets for at
most 60 seconds. “Make them brighter/dimmer” adjusts each light by up to ten
percentage points, preserving its power state and clamping to 0–100. “Turn it/them
off/on” and supported percentage/temperature follow-ups reuse the existing guarded
executor. Singular “it” requires one target. Unsupported or stale references ask
for a device and room again; they do not guess.

An ambiguous command produces a room/device question and a horizontally scrollable
choice row. Nothing changes until a current choice is spoken or tapped. Every
permitted candidate remains selectable, while spoken copy names at most three.
Duplicate or colliding names require an explicit choice. New requests and Cancel
retire the pending request. A home brief cannot leave an old command waiting.

With hands-free mode enabled, successful spoken controls and clarification
questions open a single-use eight-second continuation window after speech finishes
and the existing 800 ms speaker-decay interval. Only a currently recognized
follow-up, choice, or cancellation can bypass the wake phrase. Unrelated requests
still need “Hey Vanta.” Status replies and failed commands do not open this window.
The window cannot extend the original five-minute Home-only consent.

## Corrections and text reliability — Preview 115

- A pending room question accepts “No, the family room,” “I meant the family room,”
  and one unambiguous current room/device choice. Only that pending action executes.
- Completed-target follow-ups accept “Actually, make it 40 percent” / “make them
  forty percent.” Compact transcript forms such as `40%` and `22°C` behave like
  spoken units. Light brightness preserves power; a percentage for remembered
  blinds updates only their opening position. Existing kind/range checks apply.
- Bare “No” cancels. Unrecognized correction requests received with the wake phrase
  retire pending action memory instead of leaving a stale command waiting.
- “No, the family room” after a completed action explains that the earlier command
  already ran and asks for a full new command. It neither silently undoes the old
  action nor replays it in a different room. This is deliberately conservative.
- One anchored correction prefix is accepted; negations, conditions, repeated
  prefixes, compound commands and unrelated wake-free requests remain rejected.
  “Actually, turn kitchen lights off” is not a supported correction: use the wake
  phrase followed by the full command without “Actually.”

Verification: **461 tests / 23 suites** pass, including **87 realistic text cases**
and **8 added real reducer/persistence cases**. TypeScript passes. These are tests
of text interpretation and app behavior, not accent/noise or microphone accuracy.
The optional benchmark is skipped in ordinary runs and was run separately (passed).
No presentation styles, voice provider, native recognizer or scene asset changed;
Preview 114 viewport checks remain prior evidence, not a repeated UI certification.

Run the local benchmark with:

```sh
VANTA_VOICE_BENCHMARK=1 npm test -- --runInBand src/features/home-assistant/voiceReliability.benchmark.test.ts
```

November 21 Mac ARM64 / Node 22.22.3 sample: 25 warm-up iterations and 150 measured
iterations per category. p95 milliseconds: named command **0.205**, ambiguous
command **1.338**, room correction **0.907**, value correction **0.008**, compound
rejection **0.713**. These measure the pure resolver only; they exclude recognition,
network, UI, device execution and spoken output. No flaky time threshold or private
speech logging was added. Raw evidence: `work/voice-reliability-benchmark.log`.

Physical latency remains unmeasured. A future on-device capture must time confirmed
transcript → control acknowledgment and confirmed transcript → actual TTS start;
the current speaking UI phase precedes audible output and is not a valid proxy.
Do not weaken the existing Sentry privacy scrubber to collect transcripts or timing.

## Boundaries

- Memory contains scoped target identities and an unresolved local command, never
  persisted audio or a durable conversation. It clears on account/home/room/grant,
  consent, background, preview, cancellation, expiry and unmount boundaries.
- Native recognition still requires confirmed final speech. A partial transcript
  can request finalization but cannot execute a command. Permission is checked
  again after microphone teardown and immediately before canonical execution.
- A follow-up allowance belongs to one spoken output. Replaced/interrupted speech
  cannot transfer it; stale queued audio cleanup cannot stop a newer owner.
- Cloud advice/drafts keep the existing checked Ask pipeline. Scene preview and
  Create remain inert; Run is still a separate action. Sensitive entry/security
  controls are outside conversational comfort execution.
- On-device brief/control parsing does not imply offline membership authorization.
  Existing household verification and device permissions remain authoritative.

## Verification and remaining acceptance

366 focused tests across 22 suites pass, including real simulation reducers,
persistence/reopen, voice consent/audio lifecycle, scene boundaries, and panel
choices. TypeScript passes. Six real-panel browser fixtures (320×568, 390×844,
440×956, 768×1024, 1024×768 and 390×440 keyboard-height) pass: contained layout,
44 px controls, last horizontal choice reachable, explicit Cancel, reduced motion,
and no browser errors. Fixture speech/answers are simulated; this is not a physical
microphone or live AI end-to-end test. Evidence lives under `work/voice-followup-*`.

Physical checks: command Living room lights on, then say “make them brighter”
without a wake word during Your turn; follow with “turn them off.” Ask “Hey Vanta,
turn lights off” from My rooms and answer a room only after the question. Confirm
no earlier change. Check Stop, an eight-second timeout, leaving Home and a phone
interruption. Quantitative latency, accent/noise recognition, heat/battery and
Android hardware acceptance remain unverified.

## Recognition maintenance assessment

A separate November 14 source review considered `expo-speech-recognition` 3.1.3
for Expo SDK 54. This is a dated candidate assessment, not a current-version
recommendation. Do not replace the reviewed native adapter blindly:

- The candidate's iOS implementation can emit `isFinal` for an Apple nonfinal
  result when iOS 18+ speech metadata has nonzero duration. That differs from this
  app's confirmed-final control boundary. A migration needs a reviewed finality
  adapter and tests before any command executes.
- Its start/stop/abort calls are event-driven, requiring microphone/TTS teardown
  barriers rather than assuming awaited promises establish ownership.
- Android vocabulary hints require API 33+ support; older devices need truthful
  fallback behavior. On-device availability, speech permission and microphone
  permission remain separate checks.
- Migration needs a new native build and physical interruption/finality tests.
  Preview 114 retains the reviewed Voice 3.2.4 patch; it adds no dependency.

Primary review sources: [existing Voice repository](https://github.com/react-native-voice/voice),
[candidate package](https://github.com/jamsch/expo-speech-recognition/blob/v3.1.3/package.json),
[pinned iOS implementation](https://github.com/jamsch/expo-speech-recognition/blob/v3.1.3/ios/ExpoSpeechRecognitionModule.swift#L448),
[candidate documentation](https://github.com/jamsch/expo-speech-recognition/blob/v3.1.3/README.md),
and [Android vocabulary hints](https://developer.android.com/reference/android/speech/RecognizerIntent#EXTRA_BIASING_STRINGS).
Recheck current releases and compatibility before that separate migration.
