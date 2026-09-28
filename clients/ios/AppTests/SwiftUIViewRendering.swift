import Foundation
import SwiftUI
import Testing
import UIKit

@MainActor
internal enum SwiftUIViewRendering {
    private static let canvas = CGSize(width: 390, height: 844)

    internal static func rendersSchemeAwareContent(
        _ view: some View, background: some View
    ) throws -> Bool {
        let light = try #require(render(view, in: .light))
        let dark = try #require(render(view, in: .dark))
        let lightBackground = try #require(render(background, in: .light))
        let darkBackground = try #require(render(background, in: .dark))

        return hasNonUniformPixels(light) && hasNonUniformPixels(dark)
            && pixels(light) != pixels(dark)
            && pixels(light) != pixels(lightBackground)
            && pixels(dark) != pixels(darkBackground)
    }

    private static func render(_ view: some View, in scheme: ColorScheme) -> CGImage? {
        let content = view.environment(\.colorScheme, scheme).frame(
            width: canvas.width, height: canvas.height)
        let controller = UIHostingController(rootView: content)
        controller.overrideUserInterfaceStyle = scheme == .dark ? .dark : .light
        controller.view.backgroundColor = .clear

        guard
            let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
                .first
        else { return nil }

        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: canvas)
        controller.view.frame = window.bounds
        window.addSubview(controller.view)
        defer { controller.view.removeFromSuperview() }
        controller.view.layoutIfNeeded()

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: canvas, format: format).image { context in
            controller.view.layer.render(in: context.cgContext)
        }.cgImage
    }

    private static func hasNonUniformPixels(_ image: CGImage) -> Bool {
        guard let providerData = image.dataProvider?.data else { return false }
        let data = providerData as Data
        let pixelSize = image.bitsPerPixel / 8
        guard pixelSize > 0, data.count >= pixelSize else { return false }
        let firstPixel = data[..<pixelSize]

        return (0..<image.height).contains { row in
            (0..<image.width).contains { column in
                let start = row * image.bytesPerRow + column * pixelSize
                let end = start + pixelSize
                return end <= data.count && data[start..<end] != firstPixel
            }
        }
    }

    private static func pixels(_ image: CGImage) -> Data? {
        image.dataProvider?.data as Data?
    }
}
