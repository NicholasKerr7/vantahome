#!/usr/bin/env python3
"""Render, encode and verify the local VantaHome assembly without AI credits.

Requires Blender 5.2+ and Apple's Swift/AVFoundation tools on macOS. These are
production-only dependencies; the app ships four small local assets.
Run: python3 scripts/build-arrival-media.py /path/to/work/brand-motion/assembly
Use --reuse-frames after a reviewed render, or --reuse-encoding after encoding.
The editable .blend, source frames and contact sheet stay in the work directory.
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
        if duration != 2 or evidence[f"{kind}Frames"] != 60:
            raise ValueError(f"Expected sixty frames in two seconds: {path.name}")
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


def manifest_for(exports: Path, evidence: dict) -> dict[str, object]:
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
    scripts = ["build-arrival-media.py", "render-arrival-assembly.py", "encode-arrival-media.swift"]
    return {
        "created": str(date.today()),
        "source": {
            "type": "deterministic-blender-geometry",
            "master": {"filename": "vantahome-icon-master.png", "sha256": MASTER_SHA256,
                       "use": "Unmodified reference; new geometry authored in Blender."},
            "blenderVersion": "5.2.2 LTS", "newGenerationCredits": 0,
            "scripts": [{"filename": name, "sha256": sha256(ROOT / "scripts" / name)} for name in scripts],
        },
        "format": {"width": 1024, "height": 768, "aspectRatio": "4:3", "videoCodec": "h264",
                   "framesPerSecond": 30, "audio": False, "edgeBackground": "#050612",
                   "totalBytes": total, "budgetBytes": 3 * 1024 * 1024},
        "choreography": {
            "shell": "Fixed roof, right chimney, U-frame and dark badge; V/core start off-canvas.",
            "enter": "Frames 1-60, two seconds: V arrives 0.15-0.65s, core 0.75-1.15s, energy activates last.",
            "hold": "Frames 60-119, two-second subtle assembled glow loop with matching authored endpoints.",
            "transition": "Exit as soon as access and renderer are actually ready; never impose a two-second delay.",
            "poster": "Exact decoded entrance frame zero, for native splash/video handoff.",
            "holdPoster": "Exact decoded hold frame zero, for source replacement and reduced motion.",
            "fallback": "Local stills; no network request, resolve clip or runtime 3D dependency.",
        },
        "verification": {
            **evidence, "devicePlayback": "Pending app integration and physical-device verification.",
            "boundaries": {
                "openingPosterMatchesDecodedFirstFrame": True, "holdPosterMatchesDecodedFirstFrame": True,
                "enterHoldMeanAbsoluteRgbErrorOutOf255": evidence["enterHoldMeanAbsoluteRgbErrorOutOf255"],
                "loopFirstLastMeanAbsoluteRgbErrorOutOf255": evidence["holdLoopMeanAbsoluteRgbErrorOutOf255"],
                "authoredPose": "Enter ends and hold starts at master frame 60; hold ends at identical keyed state at 119.",
            },
            "visualReview": "Review assembly-contact.png and both clips after regeneration; keep source frames outside app assets.",
        },
        "assets": records,
    }


def build(work: Path, destination: Path, blender: str, reuse_frames: bool, reuse_encoding: bool) -> None:
    """Run checked production stages, then publish only the bounded app assets."""
    if sha256(MASTER) != MASTER_SHA256:
        raise ValueError("The approved icon master changed.")
    work.mkdir(parents=True, exist_ok=True)
    if not reuse_frames and not reuse_encoding:
        execute([blender, "-b", "--factory-startup", "--python", "scripts/render-arrival-assembly.py",
                 "--", "--output", str(work), "--render"])
    evidence_path = work / "encoding-evidence.json"
    exports = work / "exports"
    if not reuse_encoding:
        encoder = work / "encode-arrival-media"
        execute(["swiftc", "scripts/encode-arrival-media.swift", "-o", str(encoder)])
        execute([str(encoder), str(work / "frames"), str(exports), str(evidence_path)])
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    manifest = manifest_for(exports, evidence)
    destination.mkdir(parents=True, exist_ok=True)
    for filename in FILENAMES:
        shutil.copyfile(exports / filename, destination / filename)
    (destination / "vantahome-arrival-resolve.mp4").unlink(missing_ok=True)
    (destination / "arrival.production.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": list(FILENAMES), "totalBytes": manifest["format"]["totalBytes"]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("work", type=Path)
    parser.add_argument("--destination", type=Path, default=ROOT / "assets/brand/motion")
    parser.add_argument("--blender", default="/Applications/Blender.app/Contents/MacOS/Blender")
    parser.add_argument("--reuse-frames", action="store_true")
    parser.add_argument("--reuse-encoding", action="store_true")
    args = parser.parse_args()
    build(args.work.resolve(), args.destination.resolve(), args.blender, args.reuse_frames, args.reuse_encoding)
