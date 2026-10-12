#!/usr/bin/env swift
/// Sample an approved Higgsfield film without reconstructing its rendered logo.
/// Usage: prepare-arrival-frames PLAN_JSON FRAME_DIRECTORY EVIDENCE_JSON
/// Crop/retime only; preserve the film's glass, reflections, camera and lighting.
import AVFoundation
import CoreImage
import Foundation
import CryptoKit

struct FramePlan: Codable {
    let sourcePath: String
    let sourceSha256: String
    let enterStart: Double
    let enterEnd: Double
    let holdEnd: Double
    let enterFrames: Int
    let holdFrames: Int
    let stageBlendInnerRadius: Double
    let stageBlendExponent: Double
}

enum PreparationError: Error {
    case invalidArguments
    case invalidPlan(String)
    case invalidSource(String)
    case imageProcessing(String)
}

let width = 1024
let height = 768
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CIContext(options: [.workingColorSpace: colorSpace, .outputColorSpace: colorSpace])

/// Fade the surrounding stage organically while preserving the central sculpture.
func stageBlendKernel() throws -> CIColorKernel {
    let source = """
    kernel vec4 blendStage(__sample pixel, __color navy, vec2 size, float innerRadius, float exponent) {
        vec2 radii = size * 0.5 - vec2(16.0);
        vec2 normalized = abs(destCoord() - size * 0.5) / radii;
        float radius = pow(pow(normalized.x, exponent) + pow(normalized.y, exponent), 1.0 / exponent);
        float weight = 1.0 - smoothstep(innerRadius, 1.0, radius);
        return mix(navy, pixel, weight);
    }
    """
    guard let kernel = CIColorKernel(source: source) else {
        throw PreparationError.imageProcessing("Could not compile superellipse stage blend")
    }
    return kernel
}

/// Center-crop a source frame to 4:3, retaining the reviewed central sculpture.
func framed(_ image: CGImage, innerRadius: Double, exponent: Double, kernel: CIColorKernel) throws -> CIImage {
    let input = CIImage(cgImage: image, options: [.colorSpace: colorSpace])
    let ratio = CGFloat(width) / CGFloat(height)
    let cropWidth = min(input.extent.width, input.extent.height * ratio)
    let cropHeight = cropWidth / ratio
    let crop = CGRect(x: (input.extent.width-cropWidth)/2, y: (input.extent.height-cropHeight)/2,
                      width: cropWidth, height: cropHeight)
    let scale = CGFloat(width) / cropWidth
    let cropped = input.cropped(to: crop)
        .transformed(by: CGAffineTransform(translationX: -crop.minX, y: -crop.minY))
        .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let extent = CGRect(x: 0, y: 0, width: width, height: height)
    let navy = CIColor(red: 5/255, green: 6/255, blue: 18/255, alpha: 1, colorSpace: colorSpace)!
    guard let result = kernel.apply(extent: extent, arguments: [cropped, navy,
                                      CIVector(x: CGFloat(width), y: CGFloat(height)), innerRadius, exponent]) else {
        throw PreparationError.imageProcessing("Could not composite superellipse stage blend")
    }
    return result.cropped(to: extent)
}

/// Read source-time samples on its frame grid for reliable exact endpoint reuse.
func sampleTime(_ seconds: Double, fps: Double, duration: Double) -> CMTime {
    let index = min(max(0, (seconds * fps).rounded()), floor(duration * fps)-1)
    return CMTime(seconds: index/fps, preferredTimescale: 60000)
}

/// Preserve one source image at the assembly junction and both hold endpoints.
func prepare(plan: FramePlan, planDigest: String, output: URL, evidence: URL) throws {
    let asset = AVURLAsset(url: URL(fileURLWithPath: plan.sourcePath))
    guard let track = asset.tracks(withMediaType: .video).first else {
        throw PreparationError.invalidSource("No video track")
    }
    let duration = CMTimeGetSeconds(asset.duration)
    let fps = Double(track.nominalFrameRate)
    guard duration.isFinite, fps.isFinite, fps > 0,
          plan.enterStart >= 0, plan.enterStart < plan.enterEnd,
          plan.enterEnd <= plan.holdEnd, plan.holdEnd < duration,
          (60...90).contains(plan.enterFrames), (30...90).contains(plan.holdFrames),
          (0.65...0.88).contains(plan.stageBlendInnerRadius),
          (2.0...4.0).contains(plan.stageBlendExponent) else {
        throw PreparationError.invalidPlan("Intervals, durations or stage blend are outside supported bounds")
    }
    try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero
    let kernel = try stageBlendKernel()
    var actualTimes = [Double]()
    var images = [Int: CIImage]()

    /// Reuse sampled frames across reversed time and identical boundary poses.
    func imageAt(_ seconds: Double) throws -> CIImage {
        let time = sampleTime(seconds, fps: fps, duration: duration)
        let frame = Int((CMTimeGetSeconds(time) * fps).rounded())
        if let cached = images[frame] { return cached }
        var actual = CMTime.zero
        let image = try generator.copyCGImage(at: time, actualTime: &actual)
        let result = try framed(image, innerRadius: plan.stageBlendInnerRadius,
                                 exponent: plan.stageBlendExponent, kernel: kernel)
        images[frame] = result
        actualTimes.append(CMTimeGetSeconds(actual))
        return result
    }

    /// Export PNG intermediates only into the work cache, never the app bundle.
    func writeFrame(_ image: CIImage, index: Int) throws {
        let url = output.appendingPathComponent(String(format: "frame-%04d.png", index))
        try context.writePNGRepresentation(of: image, to: url, format: .RGBA8,
                                           colorSpace: colorSpace, options: [:])
    }

    for index in 0..<plan.enterFrames {
        let progress = Double(index) / Double(plan.enterFrames-1)
        let seconds = plan.enterStart + progress * (plan.enterEnd-plan.enterStart)
        try writeFrame(imageAt(seconds), index: index+1)
    }
    for index in 0..<plan.holdFrames {
        // Cosine ping-pong eases direction changes and matches both endpoint poses.
        let phase = Double(index) / Double(plan.holdFrames-1)
        let progress = (1-cos(phase * 2 * .pi))/2
        let seconds = plan.enterEnd + progress * (plan.holdEnd-plan.enterEnd)
        try writeFrame(imageAt(seconds), index: plan.enterFrames+index+1)
    }
    let report: [String: Any] = [
        "method": "AVFoundation source sampling; Core Image center crop and protected superellipse stage blend",
        "sourceSha256": plan.sourceSha256,
        "planSha256": planDigest,
        "sourceSeconds": duration, "sourceFramesPerSecond": fps,
        "sourceWidth": track.naturalSize.width, "sourceHeight": track.naturalSize.height,
        "sampledSourceTimesSeconds": actualTimes.sorted(),
        "sourceBoundaryReuse": "Identical cached source image at entrance end, hold start and hold end",
        "holdMethod": "Cosine forward/reverse of reviewed assembled tail",
        "stageBlend": ["shape": "superellipse", "innerRadius": plan.stageBlendInnerRadius,
                        "exponent": plan.stageBlendExponent, "solidNavyRimPixels": 16,
                        "centralSourceOpacity": 1.0],
        "logoReconstruction": false, "newGeneration": false
    ]
    try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: evidence)
    print("Prepared \(plan.enterFrames) entrance frames and \(plan.holdFrames) hold frames from the source film.")
}

do {
    guard CommandLine.arguments.count == 4 else { throw PreparationError.invalidArguments }
    let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    let plan = try JSONDecoder().decode(FramePlan.self, from: data)
    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    try prepare(plan: plan, planDigest: digest, output: URL(fileURLWithPath: CommandLine.arguments[2]),
                evidence: URL(fileURLWithPath: CommandLine.arguments[3]))
} catch {
    fputs("Arrival frame preparation failed: \(error)\n", stderr)
    exit(1)
}
