import DesignSystemTestSupport
import Foundation
import SwiftUI
import Testing

@testable import DesignSystem

@MainActor
@Suite("PopsPagedPhotoViewer")
internal struct PopsPagedPhotoViewerTests {
    @Test("clampedIndex clamps below zero and above the last index")
    func clampsToAvailablePages() {
        #expect(PopsPagedPhotoViewerPresentation.clampedIndex(-1, count: 3) == 0)
        #expect(PopsPagedPhotoViewerPresentation.clampedIndex(9, count: 3) == 2)
    }

    @Test("an empty or invalid image count clamps to zero", arguments: [0, -1])
    func emptyOrInvalidCountClampsToZero(count: Int) {
        #expect(PopsPagedPhotoViewerPresentation.clampedIndex(4, count: count) == 0)
    }

    @Test("a single image renders even when the requested page is out of range")
    func singleImageWithBadInitialIndexRenders() throws {
        let png = try #require(PopsTestImage.pngData(), "the fixture image could not be encoded")
        let viewer = PopsPagedPhotoViewer(
            images: [png], initialIndex: 9, placeholderSymbol: "doc.text.viewfinder"
        )
        .frame(width: PopsSize.pageWidth, height: PopsSize.pageHeight)

        #expect(PrimitiveRenderingTests.render(viewer, in: .light) != nil)
    }

    @Test("the iOS viewer installs the native page style")
    func installsPageStyle() throws {
        let viewer = try String(
            contentsOf: Self.primitives.appending(path: "PopsPagedPhotoViewer.swift"),
            encoding: .utf8)
        let platform = try String(
            contentsOf: Self.primitives.appending(path: "PopsPagedPhotoViewerPlatform.swift"),
            encoding: .utf8)

        #expect(viewer.contains(".popsPagedPhotoStyle()"))
        #expect(platform.contains("tabViewStyle(.page)"))
    }

    @Test("paging reports the selected page while existing call sites keep a default callback")
    func pageChangeCallbackWiring() throws {
        let source = try String(
            contentsOf: Self.primitives.appending(path: "PopsPagedPhotoViewer.swift"),
            encoding: .utf8)

        #expect(source.contains("onPageChange: @escaping (Int) -> Void = { _ in }"))
        #expect(source.contains(".onChange(of: index)"))
        #expect(source.contains("onPageChange(pageIndex)"))
    }

    private static let primitives = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appending(path: "Sources/DesignSystem/Primitives")
}
