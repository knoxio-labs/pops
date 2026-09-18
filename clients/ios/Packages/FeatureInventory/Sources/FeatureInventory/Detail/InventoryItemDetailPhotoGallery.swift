import AppCore
import CoreGraphics
import DesignSystem
import Foundation
import ImageIO
import SwiftUI

/// Fetches one rendition of a photograph by content hash, or nil when it
/// cannot be had.
internal typealias InventoryPhotoLoader = @MainActor (String, InventoryPhotoVariant) async -> Data?

/// The header's picture area: the first photograph at full width, the rest as
/// a strip of thumbnails inset over its bottom edge on a fade that keeps them
/// legible over any photograph, and a tap into the lightbox.
///
/// Edge to edge and square-cornered rather than a plate inside a card: a
/// photograph is the content layer, so it carries no material of its own.
internal struct InventoryItemDetailHeroPhotos: View {
    internal let photos: [InventoryDetailPhoto]
    /// The item's own glyph, which stands in when there is no photograph.
    internal let symbol: String
    internal let load: InventoryPhotoLoader
    @State private var viewing: InventoryDetailPhoto?
    @ScaledMetric(relativeTo: .caption) private var thumbnail = PopsSize.countField

    internal var body: some View {
        surface
            .overlay(alignment: .bottom) {
                if photos.count > 1 { strip }
            }
            .sheet(item: $viewing) { photo in
                InventoryItemDetailLightbox(photos: photos, opening: photo, load: load)
            }
    }

    @ViewBuilder private var surface: some View {
        if let first = photos.first {
            Button {
                viewing = first
            } label: {
                InventoryItemDetailPicture(
                    photo: first, variant: .medium, symbol: symbol, load: load
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(first.caption)
        } else {
            InventoryItemDetailPicture(photo: nil, variant: .medium, symbol: symbol, load: load)
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
                        InventoryItemDetailPlate(photo: photo, variant: .thumb, load: load)
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

/// What is drawn where a photograph goes: the picture once its bytes arrive,
/// the item's own glyph when there is none, or the broken state when the
/// bytes cannot be had or decoded.
internal struct InventoryItemDetailPicture: View {
    private enum Load {
        case waiting
        case shown(Image)
        case broken
    }

    internal let photo: InventoryDetailPhoto?
    internal let variant: InventoryPhotoVariant
    internal let symbol: String
    internal let load: InventoryPhotoLoader
    @State private var state = Load.waiting

    internal var body: some View {
        Color.popsSurface
            .overlay {
                switch state {
                case .shown(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .broken:
                    broken
                case .waiting:
                    Image(systemName: photo == nil ? symbol : InventorySymbol.photo.system)
                        .font(.popsLargeTitle)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            }
            .clipped()
            .task(id: photo?.sha256) {
                state = .waiting
                guard let photo else { return }
                let data = await load(photo.sha256, variant)
                state = data.flatMap(Self.decode).map(Load.shown) ?? .broken
            }
    }

    /// Decodes bytes this build can draw, or nil for bytes it cannot.
    private static func decode(_ data: Data) -> Image? {
        guard !data.isEmpty,
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let cgImage = CGImageSourceCreateThumbnailAtIndex(
                source, 0,
                [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 2_048,
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
    internal let photo: InventoryDetailPhoto?
    internal let variant: InventoryPhotoVariant
    internal let load: InventoryPhotoLoader

    internal var body: some View {
        InventoryItemDetailPicture(
            photo: photo, variant: variant, symbol: InventorySymbol.photo.system, load: load
        )
        .clipShape(RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.control, style: .continuous)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
    }
}

/// The full-screen view a tap on a photograph opens, one at a time, stepped
/// by hand with two buttons because the paged tab style does not exist on
/// the host toolchain this package also builds for.
internal struct InventoryItemDetailLightbox: View {
    internal let photos: [InventoryDetailPhoto]
    internal let load: InventoryPhotoLoader
    @Environment(\.dismiss) private var dismiss
    @State private var index: Int

    internal init(
        photos: [InventoryDetailPhoto], opening: InventoryDetailPhoto,
        load: @escaping InventoryPhotoLoader
    ) {
        self.photos = photos
        self.load = load
        _index = State(initialValue: photos.firstIndex(of: opening) ?? 0)
    }

    private var current: InventoryDetailPhoto { photos[index] }

    internal var body: some View {
        NavigationStack {
            VStack(spacing: PopsSpacing.md) {
                InventoryItemDetailPlate(photo: current, variant: .full, load: load)
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
