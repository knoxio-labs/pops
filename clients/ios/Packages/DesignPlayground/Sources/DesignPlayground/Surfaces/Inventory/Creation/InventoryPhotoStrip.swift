import DesignSystem
import SwiftUI

/// The photographs staged against a draft, and the four things that can be
/// done to one.
///
/// Encouraged and optional, so the empty strip offers rather than complains:
/// no rule, no red, and no count of what is missing. The bytes are held
/// against the draft's internal id from the moment one is taken, which is why
/// an upload state can be drawn here at all, before any record exists.
internal struct InventoryPhotoStrip: View {
    internal let photos: [InventoryDraftPhoto]
    @State private var picking = false

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.sm) {
            if photos.isEmpty {
                addButton
            } else {
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: PopsSpacing.sm) {
                        ForEach(photos) { InventoryPhotoTile(photo: $0) }
                        addButton
                    }
                }
                .scrollIndicators(.hidden)
            }
            if let message = photos.progress.message {
                Text(message)
                    .font(.popsCaption)
                    .foregroundStyle(
                        photos.progress.isFailed ? Color.popsDestructive : Color.popsMutedForeground
                    )
            }
        }
        .confirmationDialog("Add a photo", isPresented: $picking, titleVisibility: .visible) {
            Button("Take a photo") {}
            Button("Choose from library") {}
            Button("Cancel", role: .cancel) {}
        }
    }

    private var addButton: some View {
        Button {
            picking = true
        } label: {
            Label(
                photos.isEmpty ? "Add a photo" : "Add another",
                systemImage: InventorySymbol.camera.system
            )
            .font(.popsSubheadline.weight(.semibold))
        }
        .playgroundGlassButton()
        .tint(.popsInventory)
    }
}

/// One staged photograph, with its caption and the controls that act on it.
internal struct InventoryPhotoTile: View {
    internal let photo: InventoryDraftPhoto
    @ScaledMetric(relativeTo: .body) private var side = PopsSize.pageWidth

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            PopsPhoto(data: nil, placeholderSymbol: InventorySymbol.library.system)
                .frame(width: side, height: side)
                .overlay(alignment: .topTrailing) { uploadMark }
                .overlay(alignment: .bottomLeading) { reorderGrip }
            Text(photo.caption.isEmpty ? "Add a caption" : photo.caption)
                .font(.popsCaption)
                .foregroundStyle(
                    photo.caption.isEmpty ? Color.popsMutedForeground : Color.popsForeground
                )
                .lineLimit(1)
                .frame(width: side, alignment: .leading)
            HStack(spacing: PopsSpacing.sm) {
                Button("Retake") {}
                Button("Delete", role: .destructive) {}
            }
            .font(.popsCaption.weight(.semibold))
            .buttonStyle(.plain)
            .foregroundStyle(Color.popsAccent)
        }
        .accessibilityElement(children: .contain)
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

    private var reorderGrip: some View {
        Image(systemName: InventorySymbol.reorder.system)
            .font(.popsCaption.weight(.semibold))
            .foregroundStyle(Color.popsMutedForeground)
            .padding(PopsSpacing.xs)
            .background(Color.popsSurface, in: .capsule)
            .padding(PopsSpacing.xs)
            .accessibilityLabel("Drag to reorder")
    }
}

extension InventoryPhotoProgress {
    /// Whether the message is a problem rather than a report of progress.
    internal var isFailed: Bool {
        guard case .failed = self else { return false }
        return true
    }
}
