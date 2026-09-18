import DesignSystem
import Foundation
import SwiftUI

/// The photographs staged against a draft, as the thing the screen opens with.
///
/// A horizontal strip rather than a panel: the camera tile leads it because
/// taking the picture is the one ask that has to happen while the object is
/// still in your hands, and everything after it can be typed later. The camera
/// is the only way in; each photograph taken lands to its right at the tile's
/// own size, so the strip reads as one row. Nothing here is labelled, because
/// a camera and a stack of photographs say what they are.
internal struct InventoryPhotoStrip: View {
    @State private var photos: [InventoryDraftPhoto]

    @ScaledMetric(relativeTo: .body) private var thumbSide = PopsSize.countField

    internal init(photos: [InventoryDraftPhoto]) {
        _photos = State(initialValue: photos)
    }

    internal var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.sm) {
                captureTile
                ForEach(photos) { photo in
                    InventoryPhotoTile(photo: photo, side: thumbSide)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .inventoryMotion(value: photos.map(\.id))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
        }
        .scrollIndicators(.hidden)
    }

    private var captureTile: some View {
        Button {
            photos.insert(InventoryDraftPhoto(id: UUID().uuidString), at: 0)
        } label: {
            InventorySymbol.camera.image
                .font(.popsTitle)
                .frame(width: thumbSide, height: thumbSide)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.popsInventory)
        .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
        .accessibilityLabel("Take a photo")
    }
}

/// One staged photograph. The upload state is a mark on the picture and the
/// two things that can be done to it are a long press away, because a caption
/// and a pair of word buttons under every thumbnail is a strip made of text.
internal struct InventoryPhotoTile: View {
    internal let photo: InventoryDraftPhoto
    internal let side: CGFloat

    internal var body: some View {
        PopsPhoto(data: photo.imageData, placeholderSymbol: InventorySymbol.photo.system)
            .frame(width: side, height: side)
            // `PopsPhoto` only clips its picture with `clipShape`, which
            // bounds paint but not layout: a very wide sample photo's
            // `scaledToFill()` ideal size otherwise leaks through the ZStack
            // and widens this tile's slot in the surrounding `HStack`, at
            // least on this project's iOS 26 SDK. `.clipped()` forces the
            // hard bound `.frame` above already implies.
            .clipped()
            .overlay(alignment: .topTrailing) { uploadMark }
            .contextMenu {
                Button("Retake") {}
                Button("Delete", role: .destructive) {}
            }
            .accessibilityLabel(photo.caption.isEmpty ? "Photo" : photo.caption)
    }

    @ViewBuilder private var uploadMark: some View {
        switch photo.upload {
        case .staged:
            EmptyView()
        case .uploading:
            ProgressView()
                .padding(PopsSpacing.xs)
        case .uploaded:
            mark(InventorySymbol.synced.system, tone: .popsMutedForeground)
        case .failed:
            mark(InventorySymbol.attention.system, tone: .popsDestructive)
        }
    }

    private func mark(_ symbol: String, tone: Color) -> some View {
        Image(systemName: symbol)
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(tone)
            .padding(PopsSpacing.xs)
            .background(Color.popsSurface, in: .circle)
            .padding(PopsSpacing.xs)
    }
}

extension InventoryPhotoProgress {
    /// Whether the message is a problem rather than a report of progress.
    internal var isFailed: Bool {
        guard case .failed = self else { return false }
        return true
    }
}
