import CoreGraphics
import DesignSystem
import Foundation
import ImageIO
import SwiftUI

/// The header's picture area: the first photograph at full width, the rest as
/// a strip of thumbnails inset over its bottom edge on a fade that keeps them
/// legible over any photograph, and a tap into the lightbox.
///
/// Edge to edge and square-cornered rather than a plate inside a card. A
/// photograph is the content layer (HIG, Liquid Glass), so it carries no
/// material of its own and nothing is drawn around it; the only glass on this
/// part of the screen is the navigation bar the picture runs under.
internal struct InventoryItemDetailHeroPhotos: View {
    internal let photos: [InventoryPhoto]
    /// The item's own glyph, which is what stands in when there is no
    /// photograph. A type's mark rather than a camera: the page is about the
    /// thing, and "no picture" is not what the reader is being told.
    internal let symbol: String
    @State private var viewing: InventoryPhoto?
    @ScaledMetric(relativeTo: .caption) private var thumbnail = PopsSize.countField

    internal var body: some View {
        surface
            .overlay(alignment: .bottom) {
                if photos.count > 1 { strip }
            }
            .sheet(item: $viewing) { photo in
                InventoryItemDetailLightbox(photos: photos, opening: photo)
            }
    }

    @ViewBuilder private var surface: some View {
        if let first = photos.first {
            Button {
                viewing = first
            } label: {
                InventoryItemDetailPicture(photo: first, symbol: symbol)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(first.caption)
        } else {
            InventoryItemDetailPicture(photo: nil, symbol: symbol)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var strip: some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.xs) {
                ForEach(photos.dropFirst()) { photo in
                    Button {
                        viewing = photo
                    } label: {
                        InventoryItemDetailPlate(photo: photo)
                            .frame(width: thumbnail, height: thumbnail)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(photo.caption)
                }
            }
            .padding(PopsSpacing.md)
        }
        .scrollIndicators(.hidden)
        .frame(height: thumbnail + PopsSpacing.md * 2)
        .background(alignment: .bottom) { fade }
    }

    private var fade: some View {
        LinearGradient(
            colors: [Color.popsBackground.opacity(0), Color.popsBackground.opacity(0.6)],
            startPoint: .top, endPoint: .bottom
        )
        .allowsHitTesting(false)
    }
}

/// What is actually drawn where a photograph goes: the picture, the item's own
/// glyph when there is none, or the reason one cannot be shown.
///
/// ``PopsPhoto`` cannot tell "no photo" from "a photo that failed to load"
/// apart, both decode to nothing, so a broken one is drawn as its own state
/// here rather than handed bytes no decoder recognises. A photo with data
/// fills the frame (`.scaledToFill()`, clipped) rather than sitting inside it,
/// the same as the shipped photo views this stages.
internal struct InventoryItemDetailPicture: View {
    internal let photo: InventoryPhoto?
    internal let symbol: String

    internal var body: some View {
        Color.popsSurface
            .overlay {
                if photo?.isBroken == true {
                    broken
                } else if let data = photo?.imageData, let image = Self.decode(data) {
                    image
                        .resizable()
                        .scaledToFill()
                } else {
                    Image(systemName: photo == nil ? symbol : InventorySymbol.photo.system)
                        .font(.popsLargeTitle)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            .clipped()
    }

    /// Whether `data` decodes to a picture this build can draw.
    ///
    /// Mirrors ``PopsPhoto``'s own decode: this view needs the `Image` before
    /// `PopsPhoto` would hand it one, because the hero fills edge to edge with
    /// square corners while `PopsPhoto` always clips to a rounded plate.
    private static func decode(_ data: Data) -> Image? {
        guard !data.isEmpty,
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let cgImage = CGImageSourceCreateThumbnailAtIndex(
                source, 0,
                [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 1_024,
                ] as CFDictionary)
        else { return nil }
        return Image(decorative: cgImage, scale: 1)
    }

    private var broken: some View {
        VStack(spacing: PopsSpacing.xs) {
            Image(systemName: "photo.badge.exclamationmark")
                .font(.popsTitle)
                .foregroundStyle(Color.popsWarning)
            Text("Couldn't load")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .accessibilityLabel("Photo failed to load")
    }
}

/// One photograph at thumbnail size, rounded and bordered so it reads as a
/// separate picture over the one behind it.
internal struct InventoryItemDetailPlate: View {
    internal let photo: InventoryPhoto?

    internal var body: some View {
        InventoryItemDetailPicture(photo: photo, symbol: InventorySymbol.photo.system)
            .clipShape(RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                    .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
            )
    }
}

/// The full-screen view a tap on a photograph opens, one at a time.
///
/// Stepped by hand with two buttons rather than `TabView(.page)`: the page
/// style does not exist on macOS, which this package also builds for (see
/// ``Catalog``'s package-graph note and `Package.swift`'s platform list),
/// and a `#if os(iOS)` outside `PlaygroundGlass.swift` is the drift that
/// file's own header forbids.
internal struct InventoryItemDetailLightbox: View {
    internal let photos: [InventoryPhoto]
    internal let opening: InventoryPhoto
    @Environment(\.dismiss) private var dismiss
    @State private var index: Int

    internal init(photos: [InventoryPhoto], opening: InventoryPhoto) {
        self.photos = photos
        self.opening = opening
        _index = State(initialValue: photos.firstIndex(of: opening) ?? 0)
    }

    private var current: InventoryPhoto { photos[index] }

    internal var body: some View {
        NavigationStack {
            VStack(spacing: PopsSpacing.md) {
                InventoryItemDetailPlate(photo: current)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                Text(current.caption)
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
                if photos.count > 1 { paging }
            }
            .padding(PopsSpacing.lg)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private var paging: some View {
        HStack(spacing: PopsSpacing.lg) {
            Button("Previous") { index = max(0, index - 1) }
                .disabled(index == 0)
            Text("\(index + 1) of \(photos.count)")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            Button("Next") { index = min(photos.count - 1, index + 1) }
                .disabled(index == photos.count - 1)
        }
    }
}
