import AppCore
import DesignSystem
import SwiftUI

/// The photographs, as the thing the form opens with.
///
/// A horizontal strip: the camera tile leads, because taking the picture is
/// the one ask that has to happen while the object is still in your hands,
/// and each photograph lands to its right at the tile's own size. Nothing is
/// labelled; a camera and a row of photographs say what they are.
///
/// `capture` is nil until photo capture is wired (POPS-3984's capture and
/// upload slice); the tile is then shown but not pressable.
internal struct InventoryPhotoStrip: View {
    internal let photos: [InventoryPhotoReference]
    internal let capture: (() -> Void)?
    internal let thumbnail: (String) async -> Data?

    @ScaledMetric(relativeTo: .body) private var side = PopsSize.countField

    internal var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.sm) {
                captureTile
                ForEach(photos) { photo in
                    InventoryPhotoTile(photo: photo, side: side, thumbnail: thumbnail)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .inventoryMotion(value: photos.map(\.sha256))
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.vertical, PopsSpacing.sm)
        }
        .scrollIndicators(.hidden)
    }

    private var captureTile: some View {
        Button {
            capture?()
        } label: {
            InventorySymbol.camera.image
                .font(.popsTitle)
                .frame(width: side, height: side)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(capture == nil ? Color.popsMutedForeground : Color.popsInventory)
        .background(Color.popsSurface, in: RoundedRectangle(cornerRadius: PopsRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: PopsRadius.card)
                .stroke(Color.popsSeparator, lineWidth: PopsBorder.hairline)
        )
        .disabled(capture == nil)
        .accessibilityLabel("Take a photo")
    }
}

/// One photograph already on the item, fetched as a thumbnail.
private struct InventoryPhotoTile: View {
    let photo: InventoryPhotoReference
    let side: CGFloat
    let thumbnail: (String) async -> Data?
    @State private var data: Data?

    var body: some View {
        PopsPhoto(data: data, placeholderSymbol: InventorySymbol.photo.system)
            .frame(width: side, height: side)
            // `PopsPhoto` clips only its paint; a very wide photo's
            // `scaledToFill()` ideal size would otherwise widen this tile's
            // slot in the strip.
            .clipped()
            .task(id: photo.sha256) { data = await thumbnail(photo.sha256) }
            .accessibilityLabel(photo.caption ?? "Photo")
    }
}
