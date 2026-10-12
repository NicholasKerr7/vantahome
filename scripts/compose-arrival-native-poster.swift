#!/usr/bin/env swift
/// Bake the UI stage blend into the native-only OS launch poster.
/// Usage: compose-arrival-native-poster SOURCE_PNG OUTPUT_PNG EVIDENCE_JSON
/// Keep these coefficients synchronized with ArrivalStageBlend in
/// src/features/arrival/CinematicArrival.tsx: objectBoundingBox ellipse,
/// cx/cy 50%, radius 48%, stops (0.83,0), (0.88,0.28), (0.95,0.85), (0.98,1).
/// Runtime posters remain exact decoded frames; only this OS image is composited.
import CoreImage
import CryptoKit
import Foundation

let width = 1024
let height = 768
let navy = [5, 6, 18]
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CIContext(options: [.workingColorSpace: colorSpace, .outputColorSpace: colorSpace])
let stops: [(offset: Double, opacity: Double)] = [(0.83, 0), (0.88, 0.28), (0.95, 0.85), (0.98, 1)]

enum CompositeError: Error {
    case invalidArguments
    case invalidImage
    case invalidKernel
    case pixelVerification(String)
}

/// Match SVG's piecewise-linear alpha stops in normalized elliptical coordinates.
func opacity(x: Int, y: Int) -> Double {
    let dx = (Double(x)+0.5-Double(width)/2) / (Double(width)*0.48)
    let dy = (Double(y)+0.5-Double(height)/2) / (Double(height)*0.48)
    let radius = hypot(dx, dy)
    if radius <= stops[0].offset { return 0 }
    for index in 1..<stops.count where radius < stops[index].offset {
        let previous = stops[index-1]
        let next = stops[index]
        let progress = (radius-previous.offset) / (next.offset-previous.offset)
        return previous.opacity + progress * (next.opacity-previous.opacity)
    }
    return 1
}

/// Read raw sRGB components without AppKit's display-profile color conversion.
func rgba(_ image: CIImage) -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: width*height*4)
    bytes.withUnsafeMutableBytes {
        context.render(image, toBitmap: $0.baseAddress!, rowBytes: width*4,
                       bounds: CGRect(x: 0, y: 0, width: width, height: height),
                       format: .RGBA8, colorSpace: colorSpace)
    }
    return bytes
}

/// Apply SVG-equivalent sRGB component blending after media decoding.
func composite(_ image: CIImage) throws -> CIImage {
    let source = """
    kernel vec4 compositeStage(__sample pixel, __color navy, vec2 size) {
        float radius = length((destCoord() - size * 0.5) / (size * 0.48));
        float alpha = 0.0;
        if (radius >= 0.98) alpha = 1.0;
        else if (radius >= 0.95) alpha = mix(0.85, 1.0, (radius - 0.95) / 0.03);
        else if (radius >= 0.88) alpha = mix(0.28, 0.85, (radius - 0.88) / 0.07);
        else if (radius > 0.83) alpha = mix(0.0, 0.28, (radius - 0.83) / 0.05);
        return mix(pixel, navy, alpha);
    }
    """
    guard let kernel = CIColorKernel(source: source),
          let result = kernel.apply(extent: image.extent, arguments: [image,
                CIColor(red: 5/255, green: 6/255, blue: 18/255, alpha: 1, colorSpace: colorSpace)!,
                CIVector(x: CGFloat(width), y: CGFloat(height))]) else {
        throw CompositeError.invalidKernel
    }
    return result
}

/// Verify every output pixel against the documented sRGB/linear-alpha formula.
func verify(source: [UInt8], output: [UInt8]) throws -> [String: Any] {
    var maximumDifference = 0
    var centralDifference = 0
    var outerDifference = 0
    for y in 0..<height {
        for x in 0..<width {
            let alpha = opacity(x: x, y: y)
            for channel in 0..<3 {
                let index = (y*width+x)*4+channel
                let expected = Int((Double(source[index]) * (1-alpha) + Double(navy[channel]) * alpha).rounded())
                maximumDifference = max(maximumDifference, abs(Int(output[index])-expected))
                if alpha == 0 { centralDifference = max(centralDifference, abs(Int(output[index])-Int(source[index]))) }
                if alpha == 1 { outerDifference = max(outerDifference, abs(Int(output[index])-navy[channel])) }
            }
        }
    }
    guard maximumDifference <= 1, centralDifference == 0, outerDifference == 0 else {
        throw CompositeError.pixelVerification("formula=\(maximumDifference), center=\(centralDifference), outer=\(outerDifference)")
    }
    return ["formulaMaximumChannelErrorOutOf255": maximumDifference,
            "protectedCenterPixelDifference": centralDifference,
            "opaqueOuterPixelDifferenceFromNavy": outerDifference,
            "method": "Every pixel checked against the SVG's sRGB component / linear alpha formula"]
}

/// Produce one native image and a hash-bound compositing record without encoding video.
func run() throws {
    guard CommandLine.arguments.count == 4 else { throw CompositeError.invalidArguments }
    let sourceURL = URL(fileURLWithPath: CommandLine.arguments[1])
    let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
    let evidenceURL = URL(fileURLWithPath: CommandLine.arguments[3])
    guard let source = CIImage(contentsOf: sourceURL, options: [.colorSpace: colorSpace]),
          source.extent.width == CGFloat(width), source.extent.height == CGFloat(height) else {
        throw CompositeError.invalidImage
    }
    try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try context.writePNGRepresentation(of: composite(source), to: outputURL, format: .RGBA8,
                                       colorSpace: colorSpace, options: [:])
    guard let output = CIImage(contentsOf: outputURL, options: [.colorSpace: colorSpace]) else {
        throw CompositeError.invalidImage
    }
    let verification = try verify(source: rgba(source), output: rgba(output))
    let sourceBytes = try Data(contentsOf: sourceURL)
    let outputBytes = try Data(contentsOf: outputURL)
    let report: [String: Any] = [
        "filename": "assets/release/arrival-native-poster.png",
        "bytes": outputBytes.count, "width": width, "height": height,
        "sha256": SHA256.hash(data: outputBytes).map { String(format: "%02x", $0) }.joined(),
        "sourcePosterSha256": SHA256.hash(data: sourceBytes).map { String(format: "%02x", $0) }.joined(),
        "gradient": ["coordinateSystem": "objectBoundingBox", "center": [0.5, 0.5], "radius": 0.48,
                     "stops": stops.map { ["offset": $0.offset, "opacity": $0.opacity] },
                     "color": "#050612", "interpolation": "sRGB components, linear alpha"],
        "verification": verification
    ]
    try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: evidenceURL)
    print("Native-only poster composited and all pixels verified against the runtime SVG formula.")
}

do { try run() }
catch {
    fputs("Native poster composition failed: \(error)\n", stderr)
    exit(1)
}
