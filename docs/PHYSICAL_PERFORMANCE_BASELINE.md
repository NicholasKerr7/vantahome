# Physical iPhone performance baseline

Recorded **October 12, 2026**, against installed **VantaHome Preview 56**.
This is a measured baseline, not a performance certification. No application
code, permissions or connected-device behavior changed. No manual quality-setting
changes were made; automatic quality-tier changes were not captured.

## Sustained 3D power and thermal capture

The lightweight Power Profiler + Thermal State recording completed and exported
successfully. Duration was **481.999 seconds**, from **15:47:20.900 to
15:55:22.898 EDT**, on an **iPhone 16 Pro Max / iOS 26.6.2**, using Xcode 27.0.
The user confirmed 3D Home was open and was instructed to keep it foreground,
leave brightness unchanged and allow the automatic cinematic tour to run.

| Measurement | Observed result |
| --- | --- |
| Thermal state | Nominal for 444.992 s; Fair for the final 37.007 s |
| Thermal coverage | Entire capture; no Serious or Critical intervals |
| Display brightness | 100% throughout the reported interval; 99.79% coverage |
| Whole-device mean power rate | 43.07% of total battery energy per hour |
| Whole-device reported-rate integral | 5.75 battery percentage points over observed intervals |
| Power data coverage | 480.925 s / 99.78%; 481 valid intervals; no overlapping intervals |
| Starting battery gauge | 34%, reported by the user before recording |
| Follow-up battery gauge | 23%, reported by the user; time of reading unconfirmed |
| Reported gauge difference | 11 percentage points; not yet assignable to the eight-minute window |
| Application continuity | Same native app PID before and after the capture |

The thermal transition occurred at **7:24.992**. Fair is a device thermal
category, not a measured surface temperature or evidence of a particular
rendering defect. This recording does not establish whether throttling occurred.

Reported whole-device power rates ranged from 39.58 to 64.33%/hr, with a rise
in the final full minute. The table uses duration-weighted means; the final
two-second partial interval is retained separately.

| Elapsed window | Whole-device power rate (%/hr) | Thermal state |
| --- | ---: | --- |
| 0–1 min | 44.53 | Nominal |
| 1–2 min | 41.24 | Nominal |
| 2–3 min | 41.77 | Nominal |
| 3–4 min | 41.73 | Nominal |
| 4–5 min | 41.59 | Nominal |
| 5–6 min | 43.11 | Nominal |
| 6–7 min | 42.24 | Nominal |
| 7–8 min | 48.39 | Nominal, then Fair |
| 8 min–8 min 2 s | 42.38 | Fair |

Native Preview process mean subsystem impact scores were CPU **4.55**, GPU
**3.34**, display **2.02**, and networking **0.00**, with respective coverage of
99.78%, 99.49%, 99.78% and 99.19%. These are Apple's comparative impact scores,
not watts or utilization percentages. Zero reported networking impact does not
prove zero traffic. Separate WebContent/GPU process work is not independently
attributed by this attached-process export.

## Conditions and limits

- The user was asked to disconnect USB and wireless charging before reporting
  the starting battery value. USB hardware inventories showed no iPhone, but
  CoreDevice retained a `wired` transport label. The charging table had no rows;
  that absence does **not** independently establish unplugged operation. Explicit
  end-of-test confirmation remains pending.
- Ending battery percentage, perceived warmth, stutters and whether the tour
  actually ran were requested immediately after the recorder hit its time limit.
  The user subsequently reported **23%**, compared with **34%** before recording.
  Clarification is pending on whether 23% was read at the capture endpoint or
  later. Do not divide this 11-point difference by the recording duration or
  treat it as a discrepancy with the profiler integral until timing is known.
  Warmth, stutters, tour playback and off-charger confirmation remain pending.
- The 5.75-point figure integrates the profiler's reported rates. It is not an
  observed battery-gauge drop or an app-only energy measurement. Do not extrapolate
  this eight-minute, full-brightness session into everyday battery life.
- Actual full-scene Three.js FPS, dropped frames and responsiveness were not
  measured here. Same-PID continuity does not prove there were no stutters,
  WebView reloads or other recoverable errors.
- Ambient temperature, case, battery health, Low Power Mode, precise scene/weather
  state and other system workloads were not independently recorded. Repeat with
  controlled conditions before attributing differences to code changes.
- Apple documents system-level power, per-app impact and condition-aware
  comparisons in [Profile and optimize power usage in your app](https://developer.apple.com/videos/play/wwdc2025/226/)
  and [Measuring your app's power use with Power Profiler](https://developer.apple.com/documentation/xcode/measuring-your-app-s-power-use-with-power-profiler).

## Next useful measurements

1. Confirm when the reported 23% gauge was read and complete the user's workload
   observations. Preserve self-report labels and timing; a delayed reading is
   not an exact eight-minute endpoint.
2. Repeat a controlled baseline at a comfortable fixed brightness, then compare
   a static 3D view with the cinematic tour on the same phone and scene. Allow
   thermal recovery, keep charging off, and record conditions and endpoints.
3. Add preview-only, bounded diagnostics inside the actual scene Canvas when
   undertaking frame-cadence work. A renderer submission counter is still not
   GPU/display FPS. Do not substitute renderer-lab demo or compositor events.
4. Evaluate one confirmed source-level candidate with an A/B capture:
   `HotspotLayout` still projects and arranges room hotspots while cinematic
   playback hides them. An inactive guard could skip this unused work while
   keeping the wrapper mounted. Clear both position and projection caches on
   reactivation and test changed room grants before adoption. Its power impact
   is currently unmeasured; do not call it the cause of this result.

Hub-backed automation, household sync and physical iPad testing remain deferred.

## Reusable evidence

Cache root: `/Users/nick007/Library/Caches/VantaHome/work`.

- `sustained-3d-power-preview56.trace`, `.log`, `-toc.xml`, `-metrics.xml`,
  `-summary.json`: final capture and duration-weighted analysis.
- `sustained-3d-protocol.json`: setup, self-reports and measurement limitations.
- `sustained-3d-postrun-processes.json`: native process continuity check.
- `sustained-power-preflight.*` and `sustained-power-preflight-schema-*.xml`:
  short capture and exact Xcode 27 schema definitions.
- `analyze-power-trace.py`, `test-analyze-power-trace.py`: local analyzer and
  eight passing regression cases. It resolves XML references, preserves gaps
  and missing values, weights intervals and rejects ambiguous overlaps.

Export the trace TOC first, then the `DeviceChargingState`,
`device-thermal-state-intervals`, `ProcessSubsystemPowerImpact`,
`SystemPowerLevel` and `DisplayBrightnessLevel` tables. Multi-table export emits
only the first schema definition in this Xcode build; the analyzer uses the
separately verified definitions and rejects incompatible column shapes.

The recorder uses only `--instrument 'Power Profiler' --instrument 'Thermal State'`
with an attached app process. Avoid the heavier stock template for this baseline;
earlier broad animation captures exhausted host disk space. This recording saved
successfully with approximately 7.7 GiB remaining on the host.
