#!/usr/bin/env python3
"""Prepare app arrival media from a reviewed Higgsfield film, preserving its CGI.

Requires Apple's Swift/AVFoundation on macOS, with no app/runtime dependency.
Run with --help for the source hash, provenance and reviewed timing arguments.
This script never generates or reconstructs a logo. Center crop, stage blending,
retiming and silent encoding preserve the supplied film's glass and reflections.
Outputs default to WORK/delivery for review; --destination selects app assets.
The OS splash is composited separately to match the runtime SVG stage blend;
--native-poster-destination explicitly publishes that native-only PNG.
Use --reuse-frames or --reuse-encoding only with an unchanged processing plan.
"""
import argparse
import hashlib
import json
import shutil
import struct
import subprocess
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "assets/brand/vantahome-icon-master.png"
MASTER_SHA256 = "1c3533ce82c3fa7bb12c45ab7e0b1123a12561d9ec06326f41da9744e32b5f9d"
FILENAMES = ("vantahome-arrival-enter.mp4", "vantahome-arrival-hold.mp4",
             "vantahome-arrival-hold.png", "vantahome-arrival-poster.png")


def execute(arguments: list[str]) -> None:
    """Run a checked production step without hiding failures."""
    subprocess.run(arguments, check=True, cwd=ROOT)


def sha256(path: Path) -> str:
    """Pin reference, production scripts and exported bytes."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def video_configuration(path: Path) -> dict[str, object]:
    """Verify AVC/SPS Main profile, 8-bit 4:2:0 and fast-start ordering.

    Main profile (77) omits chroma/bit-depth extensions: normative defaults are
    chroma_format_idc=1 and bit_depth_luma/chroma_minus8=0. Check both avcC and
    its SPS instead of treating requested encoder settings as observed evidence.
    AVFoundation separately verifies dimensions and fully decodes each video.
    """
    data = path.read_bytes()
    offset = data.find(b"avcC")
    if offset < 4:
        raise ValueError(f"Missing AVC configuration: {path.name}")
    size = int.from_bytes(data[offset-4:offset], "big")
    config = data[offset+4:offset-4+size]
    if len(config) < 12 or config[0] != 1 or config[1] != 77 or config[3] != 31:
        raise ValueError(f"Expected H.264 Main 3.1: {path.name}")
    if config[5] & 31 != 1:
        raise ValueError(f"Expected one SPS: {path.name}")
    sps_size = int.from_bytes(config[6:8], "big")
    sps = config[8:8+sps_size]
    if len(sps) != sps_size or len(sps) < 4 or sps[0] & 31 != 7 or sps[1] != 77 or sps[3] != 31:
        raise ValueError(f"SPS does not confirm Main 3.1: {path.name}")
    if not 0 <= data.find(b"moov") < data.find(b"mdat"):
        raise ValueError(f"Movie is not fast-start: {path.name}")
    return {"profile": "Main", "profileIdc": 77, "levelIdc": 31,
            "chromaFormatIdc": 1, "bitDepthLuma": 8, "bitDepthChroma": 8,
            "spsHex": sps.hex(), "fastStart": True,
            "verificationMethod": "Read avcC and SPS; Main profile fixes 8-bit 4:2:0."}


def describe(path: Path, evidence: dict) -> dict[str, object]:
    """Bind AVFoundation decode and binary-header observations to file hashes."""
    stream = {"codec_type": "video", "width": 1024, "height": 768}
    details = {"size": str(path.stat().st_size)}
    configuration = None
    if path.suffix == ".mp4":
        configuration = video_configuration(path)
        kind = "enter" if "-enter." in path.name else "hold"
        duration = evidence[f"{kind}Seconds"]
        if not 1 <= duration <= 3 or abs(duration * 30 - evidence[f"{kind}Frames"]) > 0.001:
            raise ValueError(f"Unexpected clip duration/frame count: {path.name}")
        stream.update(codec_name="h264", pix_fmt="yuv420p", r_frame_rate="30/1")
        details["duration"] = f"{duration:.6f}"
    else:
        header = path.read_bytes()[:29]
        if header[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", header[16:24]) != (1024, 768):
            raise ValueError(f"Unexpected poster dimensions: {path.name}")
        if header[24] != 8 or header[25] not in (2, 6):
            raise ValueError(f"Expected eight-bit RGB/RGBA poster: {path.name}")
        stream.update(codec_name="png", pix_fmt="rgb24" if header[25] == 2 else "rgba")
    record = {"filename": path.name, "bytes": path.stat().st_size, "sha256": sha256(path),
              "probe": {"method": "AVFoundation full decode + binary media headers",
                        "streams": [stream], "format": details}}
    if configuration:
        record["avcConfiguration"] = configuration
    return record


def compose_native_poster(exports: Path, work: Path) -> tuple[Path, dict]:
    """Bake the runtime SVG blend for the OS without changing decoded posters.

    The helper independently checks every pixel against the SVG's documented
    sRGB/linear-alpha formula. Review runs keep this extra output in the cache;
    publishing to native assets requires --native-poster-destination.
    """
    helper = work / "compose-arrival-native-poster"
    output = work / "native/arrival-native-poster.png"
    evidence_path = work / "native-composite-evidence.json"
    execute(["swiftc", "scripts/compose-arrival-native-poster.swift", "-o", str(helper)])
    source = exports / "vantahome-arrival-poster.png"
    execute([str(helper), str(source), str(output), str(evidence_path)])
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    if evidence["sha256"] != sha256(output) or evidence["sourcePosterSha256"] != sha256(source):
        raise ValueError("Native composite evidence does not match its source/output bytes.")
    return output, evidence


def manifest_for(exports: Path, evidence: dict, preparation: dict, plan: dict,
                 provenance_path: Path, provenance: dict) -> dict[str, object]:
    """Document production provenance, choreography and measured seams."""
    if not evidence["firstFramePostersMatchExactly"] or evidence["fullVideoDecode"] != "passed":
        raise ValueError("Exact poster/full decode validation did not pass.")
    for label in ("openingBackground", "holdBackground"):
        if evidence[label]["outerBorderMaximumChannelErrorOutOf255"] > 4:
            raise ValueError("Video edges no longer blend with the app navy.")
    records = [describe(exports / filename, evidence) for filename in FILENAMES]
    total = sum(record["bytes"] for record in records)
    if total > 3 * 1024 * 1024:
        raise ValueError("Arrival media exceeds the 3 MiB production budget.")
    scripts = ["build-arrival-media.py", "prepare-arrival-frames.swift", "encode-arrival-media.swift",
               "compose-arrival-native-poster.swift"]
    return {
        "created": str(date.today()),
        "source": {
            "type": "higgsfield-source-film",
            "filename": Path(plan["sourcePath"]).name, "sha256": plan["sourceSha256"],
            "provider": "Higgsfield", "model": provenance.get("model"), "jobId": provenance.get("jobId"),
            "productionRecord": {"filename": provenance_path.name, "sha256": sha256(provenance_path)},
            "master": {"filename": "vantahome-icon-master.png", "sha256": MASTER_SHA256,
                       "use": "Original icon preserved; this pipeline processes the supplied Higgsfield film."},
            "postprocessingGenerationCredits": 0,
            "scripts": [{"filename": name, "sha256": sha256(ROOT / "scripts" / name)} for name in scripts],
        },
        "format": {"width": 1024, "height": 768, "aspectRatio": "4:3", "videoCodec": "h264",
                   "framesPerSecond": 30, "audio": False, "edgeBackground": "#050612",
                   "totalBytes": total, "budgetBytes": 3 * 1024 * 1024},
        "choreography": {
            "sourceIntervalsSeconds": {key: plan[key] for key in ("enterStart", "enterEnd", "holdEnd")},
            "enter": "Retimed reviewed source interval; preserves original CGI surfaces and camera.",
            "hold": "Cosine-paced forward/reverse of the reviewed assembled tail, sharing exact source endpoints.",
            "transition": "Exit as soon as access and renderer are actually ready; never impose the film duration.",
            "poster": "Exact decoded entrance frame zero; the runtime SVG blend is separately baked into the native-only OS splash.",
            "holdPoster": "Exact decoded hold frame zero, for source replacement and reduced motion.",
            "fallback": "Local stills; no network request, resolve clip or runtime 3D dependency.",
        },
        "verification": {
            **evidence, "sourcePreparation": preparation,
            "devicePlayback": "Pending app integration and physical-device verification.",
            "boundaries": {
                "openingPosterMatchesDecodedFirstFrame": True, "holdPosterMatchesDecodedFirstFrame": True,
                "enterHoldMeanAbsoluteRgbErrorOutOf255": evidence["enterHoldMeanAbsoluteRgbErrorOutOf255"],
                "loopFirstLastMeanAbsoluteRgbErrorOutOf255": evidence["holdLoopMeanAbsoluteRgbErrorOutOf255"],
                "sourcePose": "Entrance end and both hold endpoints reuse the identical sampled source image.",
            },
            "visualReview": "Review arrival-contact.png and both clips before packaging; source-frame inspection must confirm contained geometry and an assembled, quiet tail.",
        },
        "assets": records,
    }


def build(args: argparse.Namespace) -> None:
    """Export four runtime assets and explicitly publish an optional OS composite."""
    if sha256(MASTER) != MASTER_SHA256:
        raise ValueError("The approved icon master changed.")
    source, work = args.source.resolve(), args.work.resolve()
    if sha256(source) != args.source_sha256:
        raise ValueError("Source film checksum differs from the approved source.")
    provenance_path = args.provenance.resolve()
    provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
    if provenance.get("provider") != "Higgsfield" or not provenance.get("jobId"):
        raise ValueError("A Higgsfield production record with its job ID is required.")
    work.mkdir(parents=True, exist_ok=True)
    plan = {"sourcePath": str(source), "sourceSha256": args.source_sha256,
            "enterStart": args.enter_start, "enterEnd": args.enter_end, "holdEnd": args.hold_end,
            "enterFrames": round(args.enter_seconds * 30), "holdFrames": round(args.hold_seconds * 30),
            "stageBlendInnerRadius": args.stage_inner_radius,
            "stageBlendExponent": args.stage_exponent,
            "preparationScriptSha256": sha256(ROOT / "scripts/prepare-arrival-frames.swift"),
            "encodingScriptSha256": sha256(ROOT / "scripts/encode-arrival-media.swift")}
    if not 60 <= plan["enterFrames"] <= 90 or not 30 <= plan["holdFrames"] <= 90:
        raise ValueError("Entrance must be 2-3 seconds; hold must be 1-3 seconds.")
    plan_path = work / "processing-plan.json"
    plan_path.write_text(json.dumps(plan, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    preparation_path = work / "frame-evidence.json"
    if not args.reuse_frames and not args.reuse_encoding:
        sampler = work / "prepare-arrival-frames"
        execute(["swiftc", "scripts/prepare-arrival-frames.swift", "-o", str(sampler)])
        execute([str(sampler), str(plan_path), str(work / "frames"), str(preparation_path)])
    preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
    if preparation.get("planSha256") != sha256(plan_path) or preparation.get("sourceSha256") != sha256(source):
        raise ValueError("Cached source frames belong to a different source or processing plan.")
    evidence_path = work / "encoding-evidence.json"
    exports = work / "exports"
    if not args.reuse_encoding:
        encoder = work / "encode-arrival-media"
        execute(["swiftc", "scripts/encode-arrival-media.swift", "-o", str(encoder)])
        execute([str(encoder), str(work / "frames"), str(exports), str(evidence_path), str(plan_path)])
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    if evidence.get("planSha256") != sha256(plan_path) or evidence.get("sourceSha256") != sha256(source):
        raise ValueError("Cached encoded assets belong to a different source or processing plan.")
    manifest = manifest_for(exports, evidence, preparation, plan, provenance_path, provenance)
    native_poster, native_evidence = compose_native_poster(exports, work)
    manifest["nativeSplashComposite"] = native_evidence
    destination = args.destination.resolve() if args.destination else work / "delivery"
    destination.mkdir(parents=True, exist_ok=True)
    for filename in FILENAMES:
        shutil.copyfile(exports / filename, destination / filename)
    if args.native_poster_destination:
        native_destination = args.native_poster_destination.resolve()
        native_destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(native_poster, native_destination)
    (destination / "vantahome-arrival-resolve.mp4").unlink(missing_ok=True)
    (destination / "arrival.production.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": list(FILENAMES), "totalBytes": manifest["format"]["totalBytes"]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("work", type=Path)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--enter-start", type=float, default=0)
    parser.add_argument("--enter-end", type=float, required=True)
    parser.add_argument("--hold-end", type=float, required=True)
    parser.add_argument("--enter-seconds", type=float, default=2.5)
    parser.add_argument("--hold-seconds", type=float, default=2)
    parser.add_argument("--stage-inner-radius", type=float, default=0.82,
                        help="Source stays untouched inside this normalized superellipse radius.")
    parser.add_argument("--stage-exponent", type=float, default=2.6,
                        help="2 is elliptical; higher values broaden the protected central stage.")
    parser.add_argument("--destination", type=Path)
    parser.add_argument("--native-poster-destination", type=Path,
                        help="Explicitly publish the separate SVG-composited OS splash PNG.")
    parser.add_argument("--reuse-frames", action="store_true")
    parser.add_argument("--reuse-encoding", action="store_true")
    args = parser.parse_args()
    build(args)
