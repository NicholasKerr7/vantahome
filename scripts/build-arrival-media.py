#!/usr/bin/env python3
"""Build small, silent launch assets from the approved Core Awakening film.

Requires ffmpeg/ffprobe on PATH. Uses only an early separation where the roof and V
stay inside the source frame; it deliberately excludes the later cropped roof.
Run: python3 scripts/build-arrival-media.py SOURCE.mp4 OUTPUT_DIRECTORY
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

SOURCE_SHA256 = "d52d03bf84fb104ab9f4084c5001ddc1b1c955c3efdbc014ee364528c5148dde"
EDGE = "clip(min(min(X,W-1-X)/80,min(Y,H-1-Y)/60),0,1)"
FRAME = (
    "crop=1440:1080:240:0,scale=1024:768:flags=lanczos,setsar=1,format=gbrp,"
    f"geq=r='r(X,Y)*{EDGE}+5*(1-{EDGE})':"
    f"g='g(X,Y)*{EDGE}+6*(1-{EDGE})':"
    f"b='b(X,Y)*{EDGE}+18*(1-{EDGE})'"
)
ENCODING = ["-an", "-c:v", "libx264", "-profile:v", "main", "-level:v", "3.1",
            "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
            "-r", "24", "-g", "24", "-movflags", "+faststart"]


def execute(arguments: list[str]) -> None:
    """Run one checked media operation, keeping any failure visible."""
    subprocess.run(arguments, check=True)


def sha256(path: Path) -> str:
    """Return the checksum used to pin source and exported bytes."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def describe(path: Path) -> dict[str, object]:
    """Probe a generated asset without depending on a Python media library."""
    data = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,pix_fmt",
        "-of", "json", str(path)], text=True))
    return {"filename": path.name, "bytes": path.stat().st_size,
            "sha256": sha256(path), "probe": data}


def pixels(path: Path, index: int = 0) -> bytes:
    """Decode a selected frame to RGB bytes for handoff comparisons."""
    return subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-vf",
        f"select=eq(n\\,{index})", "-frames:v", "1", "-f", "rawvideo",
        "-pix_fmt", "rgb24", "-"
    ])


def last_frame_index(path: Path) -> int:
    """Read the encoded frame count so loop measurements use its real endpoint."""
    return int(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=nb_frames", "-of",
        "default=noprint_wrappers=1:nokey=1", str(path)
    ], text=True).strip()) - 1


def boundary_evidence(destination: Path) -> dict[str, object]:
    """Measure codec-level seams; poster equality must be exact."""
    enter = destination / "vantahome-arrival-enter.mp4"
    hold = destination / "vantahome-arrival-hold.mp4"
    first_enter = pixels(enter)
    first_hold = pixels(hold)
    last_hold = pixels(hold, last_frame_index(hold))
    if len(first_hold) != len(last_hold):
        raise ValueError("Hold frame dimensions changed.")
    return {
        "openingPosterMatchesDecodedFirstFrame": first_enter == pixels(
            destination / "vantahome-arrival-poster.png"),
        "holdPosterMatchesDecodedFirstFrame": first_hold == pixels(
            destination / "vantahome-arrival-hold.png"),
        "loopFirstLastMeanAbsoluteRgbErrorOutOf255": round(
            sum(abs(a - b) for a, b in zip(first_hold, last_hold)) / len(first_hold), 4),
        "loopPose": "Forward/reverse source segment; decoded boundary difference measured above.",
    }


def build(source: Path, destination: Path) -> None:
    """Create interrupted-by-readiness clips and exact visual fallback frames."""
    if sha256(source) != SOURCE_SHA256:
        raise ValueError("Source checksum differs from approved 1080p delivery.")
    destination.mkdir(parents=True, exist_ok=True)
    common = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source)]
    clips = {
        "enter": f"trim=start_frame=0:end_frame=49,setpts=(PTS-STARTPTS)/1.5,{FRAME},fps=24",
        "resolve": f"trim=start_frame=0:end_frame=48,reverse,setpts=(PTS-STARTPTS)/2,{FRAME},fps=24",
    }
    for name, graph in clips.items():
        execute(common + ["-vf", graph] + ENCODING +
                [str(destination / f"vantahome-arrival-{name}.mp4")])
    # Reverse a short, slowed segment to meet at the identical boundary pose.
    # Frame interpolation softens the motion; no long full-film replay is needed.
    hold_graph = (
        f"[0:v]trim=start_frame=47:end_frame=54,setpts=4*(PTS-STARTPTS),{FRAME},"
        "minterpolate=fps=24:mi_mode=blend:scd=none,split[forward][copy];"
        "[copy]reverse[backward];[forward][backward]concat=n=2:v=1:a=0[hold]"
    )
    execute(common + ["-filter_complex", hold_graph, "-map", "[hold]"] + ENCODING +
            [str(destination / "vantahome-arrival-hold.mp4")])
    for name, clip in [("poster", "enter"), ("hold", "hold")]:
        execute(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i",
                 str(destination / f"vantahome-arrival-{clip}.mp4"), "-frames:v", "1",
                 str(destination / f"vantahome-arrival-{name}.png")])
    outputs = [destination / filename for filename in (
        "vantahome-arrival-enter.mp4", "vantahome-arrival-hold.mp4",
        "vantahome-arrival-hold.png", "vantahome-arrival-poster.png",
        "vantahome-arrival-resolve.mp4",
    )]
    for path in outputs:
        if path.suffix == ".mp4":
            execute(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"])
    manifest = {
        "created": "2026-10-12",
        "source": {"filename": "vantahome-core-awakening-1080p.mp4", "sha256": SOURCE_SHA256,
                   "productionRecord": "core-awakening.production.json"},
        "format": {"width": 1024, "height": 768, "aspectRatio": "4:3",
                   "videoCodec": "h264", "framesPerSecond": 24, "audio": False, "edgeBackground": "#050612",
                   "cropInSource": {"x": 240, "y": 0, "width": 1440, "height": 1080}},
        "choreography": {
            "enter": "Play once while actual startup work is pending; may exit early.",
            "hold": "Loop a subtle forward/reverse suspension; first and last source poses match.",
            "resolve": "Optional brief reassembly. Never delay a usable app to finish it.",
            "poster": "First source frame, used for the launch handoff, reduced motion and playback failure.",
            "fallback": "Retain the still if decoding fails; no remote asset is needed at runtime.",
            "transition": "Keep one surface mounted across access and scene readiness. Crossfade any clip replacement.",
        },
        "verification": {"fullVideoDecode": "passed", "devicePlayback": "not performed",
                         "boundaries": boundary_evidence(destination),
                         "visualReview": "Requires visual inspection after regenerating."},
        "assets": [describe(path) for path in outputs],
    }
    (destination / "arrival.production.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": [item["filename"] for item in manifest["assets"]],
                      "totalBytes": sum(item["bytes"] for item in manifest["assets"])}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    arguments = parser.parse_args()
    build(arguments.source, arguments.destination)
