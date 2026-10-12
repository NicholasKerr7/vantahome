#!/usr/bin/env swift
/// Encode deterministic Blender frames with Apple's built-in H.264 pipeline.
/// No app/runtime dependency is added. Compile with:
/// swiftc scripts/encode-arrival-media.swift -o /path/to/work/encode-arrival-media
/// Usage: encode-arrival-media FRAME_DIRECTORY ASSET_DIRECTORY EVIDENCE_JSON [--enter-only]
import AVFoundation
import CoreImage
import Foundation
import ImageIO
import CoreMedia
import CoreText

let width = 1024
let height = 768
let fps: Int32 = 30
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CIContext(options: [.workingColorSpace: colorSpace, .outputColorSpace: colorSpace])

enum MediaError: Error {
    case invalidArguments
    case invalidFrame(String)
    case encoding(String)
    case decoding(String)
}

/// Read one rendered PNG without changing its geometry or color identity.
func sourceImage(_ url: URL) throws -> CIImage {
    guard let image = CIImage(contentsOf: url, options: [.colorSpace: colorSpace]),
          image.extent.width == CGFloat(width), image.extent.height == CGFloat(height) else {
        throw MediaError.invalidFrame(url.lastPathComponent)
    }
    return image
}

/// Encode a bounded frame interval to silent, fast-start H.264 Main 3.1.
func encode(frames: ClosedRange<Int>, input: URL, output: URL) throws {
    try? FileManager.default.removeItem(at: output)
    let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let compression: [String: Any] = [
        AVVideoAverageBitRateKey: 1_600_000,
        AVVideoExpectedSourceFrameRateKey: Int(fps),
        AVVideoMaxKeyFrameIntervalKey: Int(fps),
        AVVideoAllowFrameReorderingKey: false,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264Main31
    ]
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width, AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: compression,
        AVVideoColorPropertiesKey: [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2
        ]
    ]
    let video = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    video.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video,
        sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:]
        ])
    writer.add(video)
    guard writer.startWriting() else { throw MediaError.encoding(writer.error?.localizedDescription ?? "start") }
    writer.startSession(atSourceTime: .zero)
    for (index, sourceFrame) in frames.enumerated() {
        while !video.isReadyForMoreMediaData {
            if writer.status == .failed { throw MediaError.encoding(writer.error?.localizedDescription ?? "append") }
            Thread.sleep(forTimeInterval: 0.002)
        }
        try autoreleasepool {
            let file = input.appendingPathComponent(String(format: "frame-%04d.png", sourceFrame))
            let image = try sourceImage(file)
            var buffer: CVPixelBuffer?
            guard let pool = adaptor.pixelBufferPool,
                  CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess,
                  let pixels = buffer else { throw MediaError.encoding("pixel buffer") }
            context.render(image, to: pixels, bounds: CGRect(x: 0, y: 0, width: width, height: height),
                           colorSpace: colorSpace)
            guard adaptor.append(pixels, withPresentationTime: CMTime(value: Int64(index), timescale: fps)) else {
                throw MediaError.encoding(writer.error?.localizedDescription ?? "append frame")
            }
        }
    }
    video.markAsFinished()
    writer.endSession(atSourceTime: CMTime(value: Int64(frames.count), timescale: fps))
    let completed = DispatchSemaphore(value: 0)
    writer.finishWriting { completed.signal() }
    completed.wait()
    guard writer.status == .completed else { throw MediaError.encoding(writer.error?.localizedDescription ?? "finish") }
}

/// Read display RGB values from a decoded frame for numerical boundary checks.
func rgba(_ image: CIImage) -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: width * height * 4)
    bytes.withUnsafeMutableBytes {
        context.render(image, toBitmap: $0.baseAddress!, rowBytes: width * 4,
                       bounds: CGRect(x: 0, y: 0, width: width, height: height),
                       format: .RGBA8, colorSpace: colorSpace)
    }
    return bytes
}

struct DecodedMovie {
    let first: [UInt8]
    let last: [UInt8]
    let count: Int
    let duration: Double
}

/// Fully decode each movie and save its exact first displayed frame as the poster.
func decode(_ url: URL, poster: URL) throws -> DecodedMovie {
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .video).first,
          asset.tracks(withMediaType: .audio).isEmpty,
          track.naturalSize == CGSize(width: width, height: height),
          track.nominalFrameRate == Float(fps),
          let format = track.formatDescriptions.first,
          CMFormatDescriptionGetMediaSubType(format as! CMFormatDescription) == kCMVideoCodecType_H264 else {
        throw MediaError.decoding("Unexpected media format")
    }
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ])
    reader.add(output)
    guard reader.startReading() else { throw MediaError.decoding("start") }
    var first = [UInt8]()
    var last = [UInt8]()
    var count = 0
    while let sample = output.copyNextSampleBuffer() {
        guard let buffer = CMSampleBufferGetImageBuffer(sample) else { throw MediaError.decoding("frame") }
        let image = CIImage(cvPixelBuffer: buffer)
        if count == 0 {
            first = rgba(image)
            try context.writePNGRepresentation(of: image, to: poster, format: .RGBA8,
                                               colorSpace: colorSpace, options: [:])
        }
        last = rgba(image)
        count += 1
    }
    guard reader.status == .completed, count == 60 else { throw MediaError.decoding("Expected 60 fully decoded frames") }
    guard rgba(try sourceImage(poster)) == first else { throw MediaError.decoding("Poster pixels differ from first video frame") }
    return DecodedMovie(first: first, last: last, count: count, duration: CMTimeGetSeconds(asset.duration))
}

/// Report RGB mean absolute difference without diluting it with the alpha channel.
func meanError(_ left: [UInt8], _ right: [UInt8]) -> Double {
    var sum: Int64 = 0
    for index in left.indices where index % 4 != 3 {
        sum += Int64(abs(Int(left[index]) - Int(right[index])))
    }
    return Double(sum) / Double(width * height * 3)
}

/// Measure decoded corners and the outer eight-pixel border against the app navy.
func backgroundEvidence(_ bytes: [UInt8]) -> [String: Any] {
    let target = [5, 6, 18]
    let corners = [(0, 0), (width-1, 0), (0, height-1), (width-1, height-1)].map { x, y in
        Array(bytes[((y * width + x) * 4)..<((y * width + x) * 4 + 3)]).map(Int.init)
    }
    var sum = 0
    var samples = 0
    var maximum = 0
    for y in 0..<height {
        for x in 0..<width where x < 8 || x >= width-8 || y < 8 || y >= height-8 {
            for channel in 0..<3 {
                let difference = abs(Int(bytes[(y * width + x) * 4 + channel]) - target[channel])
                sum += difference
                maximum = max(maximum, difference)
                samples += 1
            }
        }
    }
    return ["targetRgb": target, "cornerRgb": corners,
            "outerBorderMeanAbsoluteErrorOutOf255": Double(sum) / Double(samples),
            "outerBorderMaximumChannelErrorOutOf255": maximum]
}

/// Assemble nine unmodified source-frame thumbnails for the choreography review.
func contactSheet(input: URL, output: URL) throws {
    guard let canvas = CGContext(data: nil, width: 960, height: 792, bitsPerComponent: 8,
                                bytesPerRow: 960 * 4, space: colorSpace,
                                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        throw MediaError.decoding("Contact sheet context")
    }
    canvas.setFillColor(CGColor(red: 5/255, green: 6/255, blue: 18/255, alpha: 1))
    canvas.fill(CGRect(x: 0, y: 0, width: 960, height: 792))
    for (index, frame) in [1,9,16,22,27,34,40,47,60].enumerated() {
        let file = input.appendingPathComponent(String(format: "frame-%04d.png", frame))
        let image = try sourceImage(file)
        guard let cgImage = context.createCGImage(image, from: image.extent) else {
            throw MediaError.invalidFrame(file.lastPathComponent)
        }
        let x = (index % 3) * 320
        let y = (2 - index / 3) * 264
        canvas.draw(cgImage, in: CGRect(x: x, y: y, width: 320, height: 240))
        let label = String(format: "%.2fs / frame %d", Double(frame-1)/Double(fps), frame)
        let attributes: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): CTFontCreateWithName("Helvetica" as CFString, 12, nil),
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(red: 0.8, green: 0.68, blue: 1, alpha: 1)
        ]
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: label, attributes: attributes))
        canvas.textPosition = CGPoint(x: x+8, y: y+247)
        CTLineDraw(line, canvas)
    }
    guard let result = canvas.makeImage(),
          let destination = CGImageDestinationCreateWithURL(output as CFURL, "public.png" as CFString, 1, nil) else {
        throw MediaError.decoding("Contact sheet output")
    }
    CGImageDestinationAddImage(destination, result, nil)
    guard CGImageDestinationFinalize(destination) else { throw MediaError.decoding("Contact sheet write") }
}

/// Generate the two clips/posters and persist measured format and seam evidence.
func run() throws {
    guard CommandLine.arguments.count == 4 ||
          (CommandLine.arguments.count == 5 && CommandLine.arguments[4] == "--enter-only") else {
        throw MediaError.invalidArguments
    }
    let input = URL(fileURLWithPath: CommandLine.arguments[1])
    let output = URL(fileURLWithPath: CommandLine.arguments[2])
    let evidence = URL(fileURLWithPath: CommandLine.arguments[3])
    try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
    let enterURL = output.appendingPathComponent("vantahome-arrival-enter.mp4")
    let holdURL = output.appendingPathComponent("vantahome-arrival-hold.mp4")
    try encode(frames: 1...60, input: input, output: enterURL)
    if CommandLine.arguments.last == "--enter-only" {
        let enter = try decode(enterURL, poster: output.appendingPathComponent("vantahome-arrival-poster.png"))
        try contactSheet(input: input, output: evidence.deletingLastPathComponent().appendingPathComponent("assembly-contact.png"))
        print("Entrance preview: \(enter.count) fully decoded frames, \(enter.duration) seconds")
        return
    }
    // Both clips include master frame 60, guaranteeing the same seated pose.
    try encode(frames: 60...119, input: input, output: holdURL)
    let enter = try decode(enterURL, poster: output.appendingPathComponent("vantahome-arrival-poster.png"))
    let hold = try decode(holdURL, poster: output.appendingPathComponent("vantahome-arrival-hold.png"))
    try contactSheet(input: input, output: evidence.deletingLastPathComponent().appendingPathComponent("assembly-contact.png"))
    let report: [String: Any] = [
        "encoder": "Apple AVFoundation H.264 Main 3.1",
        "width": width, "height": height, "framesPerSecond": Int(fps),
        "audio": false, "pixelFormat": "yuv420p", "fastStart": true,
        "enterFrames": enter.count, "holdFrames": hold.count,
        "enterSeconds": enter.duration, "holdSeconds": hold.duration,
        "firstFramePostersMatchExactly": true, "fullVideoDecode": "passed",
        "openingBackground": backgroundEvidence(enter.first),
        "holdBackground": backgroundEvidence(hold.first),
        "enterHoldMeanAbsoluteRgbErrorOutOf255": meanError(enter.last, hold.first),
        "holdLoopMeanAbsoluteRgbErrorOutOf255": meanError(hold.last, hold.first)
    ]
    let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: evidence)
    print(String(decoding: data, as: UTF8.self))
}

do {
    try run()
} catch {
    fputs("Arrival encoding failed: \(error)\n", stderr)
    exit(1)
}
