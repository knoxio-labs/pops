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
/// `capture` is nil until the store this form writes through can take a
/// photo at all (`InventoryItemFormModel`'s seam); the tile is then shown
/// but not pressable.
internal struct InventoryPhotoStrip: View {
    internal let photos: [InventoryFormPhoto]
    internal let capture: ((InventoryPhotoSource) -> Void)?
    internal let retry: (String) -> Void
    internal let remove: (String) -> Void
    internal let thumbnail: (String) async -> Data?

    @ScaledMetric(relativeTo: .body) private var side = PopsSize.countField
    @State private var isChoosingSource = false

    internal var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: PopsSpacing.sm) {
                captureTile
                ForEach(photos) { photo in
                    InventoryPhotoTile(photo: photo, side: side, thumbnail: thumbnail)
                        .contextMenu {
                            if photo.hasFailed {
                                Button("Retry") { retry(photo.sha256) }
                                Button("Remove", role: .destructive) { remove(photo.sha256) }
                            }
                        }
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
            if InventoryCameraAvailability.isAvailable {
                isChoosingSource = true
            } else {
                capture?(.library)
            }
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
        .confirmationDialog("Add a photo", isPresented: $isChoosingSource, titleVisibility: .hidden)
        {
            Button("Take Photo") { capture?(.camera) }
            Button("Choose from Library") { capture?(.library) }
        }
    }
}

/// One photograph already on the item, or captured this session, fetched as
/// a thumbnail.
private struct InventoryPhotoTile: View {
    let photo: InventoryFormPhoto
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
            .overlay(alignment: .topTrailing) { uploadMark }
            .task(id: photo.sha256) { data = await thumbnail(photo.sha256) }
            .accessibilityLabel(photo.caption ?? "Photo")
    }

    @ViewBuilder private var uploadMark: some View {
        switch photo.upload {
        case .attached, .uploaded:
            EmptyView()
        case .uploading:
            ProgressView()
                .padding(PopsSpacing.xs)
        case .failed:
            Image(systemName: InventorySymbol.attention.system)
                .font(.popsCaption.weight(.semibold))
                .foregroundStyle(Color.popsDestructive)
                .padding(PopsSpacing.xs)
                .background(Color.popsSurface, in: .circle)
                .padding(PopsSpacing.xs)
        }
    }
}
