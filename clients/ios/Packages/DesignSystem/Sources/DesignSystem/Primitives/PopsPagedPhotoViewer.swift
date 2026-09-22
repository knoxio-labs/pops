import Foundation
import SwiftUI

/// A swipeable page viewer for encoded photos, with native page position indicators.
///
/// The viewer is intentionally domain-free so features can show receipt pages without sharing
/// their models. Each page owns an independent ``PopsZoomablePhoto`` interaction state.
public struct PopsPagedPhotoViewer: View {
    private let images: [Data]
    private let placeholderSymbol: String
    private let onPageChange: (Int) -> Void

    @State private var index: Int

    /// Creates a paged photo viewer.
    ///
    /// - Parameters:
    ///   - images: Encoded images in display order. An empty collection draws no pages.
    ///   - initialIndex: The initially visible page. Values outside `images` are clamped.
    ///   - placeholderSymbol: The SF Symbol drawn when a page cannot decode its image.
    ///   - onPageChange: Called when paging selects another image.
    public init(
        images: [Data],
        initialIndex: Int = 0,
        placeholderSymbol: String,
        onPageChange: @escaping (Int) -> Void = { _ in }
    ) {
        self.images = images
        self.placeholderSymbol = placeholderSymbol
        self.onPageChange = onPageChange
        _index = State(
            initialValue: PopsPagedPhotoViewerPresentation.clampedIndex(
                initialIndex, count: images.count))
    }

    public var body: some View {
        TabView(selection: $index) {
            ForEach(images.indices, id: \.self) { pageIndex in
                PopsZoomablePhoto(
                    data: images[pageIndex], placeholderSymbol: placeholderSymbol
                )
                .id(PageIdentity(index: pageIndex, data: images[pageIndex]))
                .tag(pageIndex)
            }
        }
        .popsPagedPhotoStyle()
        .onChange(of: images.count) { _, count in
            index = PopsPagedPhotoViewerPresentation.clampedIndex(index, count: count)
        }
        .onChange(of: index) { _, pageIndex in
            onPageChange(pageIndex)
        }
    }

    private struct PageIdentity: Hashable {
        let index: Int
        let data: Data
    }
}

internal enum PopsPagedPhotoViewerPresentation {
    internal static func clampedIndex(_ requested: Int, count: Int) -> Int {
        guard count > 0 else { return 0 }
        return min(max(requested, 0), count - 1)
    }
}
