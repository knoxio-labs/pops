import DesignSystem
import ImageIO
import SwiftUI

/// A row's leading mark: the photograph when there is one, the kind's glyph
/// when there is not, or while the photograph is still on its way, and a
/// small container glyph over a container's photo so the kind still reads.
/// Inside a selectable row it is also the control that selects the row.
internal struct InventoryRecordMark: View {
    /// The photo's content hash, if the record has one.
    internal let photo: String?
    internal let symbol: InventorySymbol
    internal var showsKindBadge = false
    internal let load: @MainActor (String) async -> Data?
    @State private var image: Image?
    @ScaledMetric(relativeTo: .body) private var size = PopsSize.touchTarget

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
    }

    internal var body: some View {
        InventorySelectableMark { picture }
    }

    private var kindBadge: some View {
        symbol.image
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsForeground)
            .padding(PopsSpacing.xs)
            .background(Color.popsSurface, in: .circle)
            .offset(x: PopsSpacing.xs, y: PopsSpacing.xs)
    }

    private var picture: some View {
        Group {
            if let image {
                Color.popsSurface
                    .overlay {
                        image
                            .resizable()
                            .scaledToFill()
                    }
                    .clipShape(shape)
                    .overlay(alignment: .bottomTrailing) {
                        if showsKindBadge { kindBadge }
                    }
            } else {
                symbol.image
                    .font(.popsHeadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
        .task(id: photo) {
            image = nil
            guard let photo, let data = await load(photo) else { return }
            image = Self.decode(data)
        }
    }

    /// Decodes a thumbnail this build can draw, or nil for bytes it cannot,
    /// which leaves the glyph in place rather than an empty plate.
    internal static func decode(_ data: Data) -> Image? {
        guard !data.isEmpty,
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let cgImage = CGImageSourceCreateThumbnailAtIndex(
                source, 0,
                [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 256,
                ] as CFDictionary)
        else { return nil }
        return Image(decorative: cgImage, scale: 1)
    }
}
