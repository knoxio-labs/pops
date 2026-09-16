import DesignSystem
import SwiftUI

/// One photograph's plate: the picture, or the reason there is not one.
///
/// ``PopsPhoto`` cannot tell "no photo" from "a photo that failed to load"
/// apart, both decode to nothing, so a broken one is drawn as its own state
/// here rather than handed bytes no decoder recognises.
internal struct InventoryItemDetailPlate: View {
    internal let photo: InventoryPhoto?
    @ScaledMetric(relativeTo: .largeTitle) private var edge = PopsSize.pageWidth

    internal var body: some View {
        ZStack {
            if photo?.isBroken == true {
                broken
            } else {
                PopsPhoto(data: nil, placeholderSymbol: InventorySymbol.item.system)
            }
        }
        .frame(width: edge, height: edge)
    }

    private var broken: some View {
        ZStack {
            Color.popsSurface
            VStack(spacing: PopsSpacing.xs) {
                Image(systemName: "photo.badge.exclamationmark")
                    .font(.popsTitle)
                    .foregroundStyle(Color.popsWarning)
                Text("Couldn't load")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card, style: .continuous)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
        .accessibilityLabel("Photo failed to load")
    }
}

/// The strip of everything photographed, and the door into the lightbox.
///
/// A `ScrollView` rather than a `List`, because this is one row of a List
/// already, see ``InventoryItemDetailView``, and a horizontal strip is not
/// the vertical scroll the playground's compactness rule is about.
internal struct InventoryItemDetailGallery: View {
    internal let photos: [InventoryPhoto]
    @State private var viewing: InventoryPhoto?
    @ScaledMetric(relativeTo: .body) private var thumbnail = PopsSize.pageWidth * 0.6

    internal var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.sm) {
                ForEach(photos) { photo in
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
        }
        .scrollIndicators(.hidden)
        .sheet(item: $viewing) { photo in
            InventoryItemDetailLightbox(photos: photos, opening: photo)
        }
    }
}

/// The full-screen view a tap on the strip opens, one photo at a time.
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
