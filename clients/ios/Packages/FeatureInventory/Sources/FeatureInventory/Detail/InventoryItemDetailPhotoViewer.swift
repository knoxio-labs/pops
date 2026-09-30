import CoreTransferable
import DesignSystem
import Foundation
import SwiftUI
import UniformTypeIdentifiers

/// The full-screen view a tap on a photograph opens: one fit-preserving,
/// zoomable page per photo, with the actions kept in the safe-area toolbar.
internal struct InventoryItemDetailLightbox: View {
    internal let photos: [InventoryDetailPhoto]
    internal let load: InventoryPhotoLoader
    internal let manage: InventoryPhotoManagement?
    @Environment(\.dismiss) private var dismiss
    @State private var loadedData: [String: Data] = [:]
    @State private var index: Int

    internal init(
        photos: [InventoryDetailPhoto], opening: InventoryDetailPhoto,
        load: @escaping InventoryPhotoLoader, manage: InventoryPhotoManagement? = nil
    ) {
        self.photos = photos
        self.load = load
        self.manage = manage
        _index = State(
            initialValue: InventoryPhotoViewerPresentation.initialIndex(
                opening, in: photos))
    }

    private var current: InventoryDetailPhoto? {
        guard photos.indices.contains(index) else { return nil }
        return photos[index]
    }

    internal var body: some View {
        ZStack {
            Color.popsBackground.ignoresSafeArea()
            TabView(selection: $index) {
                ForEach(photos.indices, id: \.self) { pageIndex in
                    let photo = photos[pageIndex]
                    InventoryItemDetailPhotoPage(
                        photo: photo,
                        data: loadedData[photo.sha256],
                        load: load,
                        onLoaded: { data in loadedData[photo.sha256] = data }
                    )
                    .id(photo.id)
                    .tag(pageIndex)
                    .accessibilityLabel(photoLabel(photo, index: pageIndex))
                }
            }
            #if os(iOS)
                .tabViewStyle(.page(indexDisplayMode: .never))
            #endif
        }
        .safeAreaInset(edge: .top, spacing: PopsSpacing.zero) { toolbar }
        .safeAreaInset(edge: .bottom, spacing: PopsSpacing.zero) { caption }
    }

    private var toolbar: some View {
        HStack(spacing: PopsSpacing.sm) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.popsHeadline)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            }
            .popsGlass(in: Circle())
            .accessibilityLabel("Close")

            Spacer(minLength: PopsSpacing.sm)

            if let current {
                shareButton(for: current)
                if let manage { managementMenu(for: current, manage: manage) }
            }
        }
        .foregroundStyle(Color.popsForeground)
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.sm)
    }

    @ViewBuilder private func shareButton(for photo: InventoryDetailPhoto) -> some View {
        if let data = loadedData[photo.sha256] {
            ShareLink(
                item: InventoryPhotoShareItem(data: data),
                preview: SharePreview(photo.caption.isEmpty ? "Photo" : photo.caption)
            ) {
                Image(systemName: "square.and.arrow.up")
                    .font(.popsHeadline)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            }
            .popsGlass(in: Circle())
            .accessibilityLabel("Share photo")
        } else {
            Button {
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.popsHeadline)
                    .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
            }
            .popsGlass(in: Circle())
            .disabled(true)
            .accessibilityLabel("Share photo")
            .accessibilityHint("Available after the photo finishes loading")
        }
    }

    private func managementMenu(
        for photo: InventoryDetailPhoto, manage: InventoryPhotoManagement
    ) -> some View {
        Menu {
            Button("Retake") {
                manage.retake(
                    photo.sha256,
                    InventoryCameraAvailability.isAvailable ? .camera : .library)
            }
            if photos.reorderedIds(moving: photo.sha256, .earlier) != nil {
                Button("Move earlier") { manage.move(photo.sha256, .earlier) }
            }
            if photos.reorderedIds(moving: photo.sha256, .later) != nil {
                Button("Move later") { manage.move(photo.sha256, .later) }
            }
            Button("Delete", role: .destructive) {
                manage.remove(photo.sha256)
                dismiss()
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.popsHeadline)
                .frame(width: PopsSize.touchTarget, height: PopsSize.touchTarget)
        }
        .popsGlass(in: Circle())
        .accessibilityLabel("More photo actions")
    }

    private var caption: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            if let current {
                Text(photoLabel(current, index: index))
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsForeground)
                    .lineLimit(2)
                Text("\(index + 1) of \(photos.count)")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, PopsSpacing.lg)
        .padding(.vertical, PopsSpacing.md)
        .background(Color.popsBackground.opacity(0.92))
    }

    private func photoLabel(_ photo: InventoryDetailPhoto, index: Int) -> String {
        InventoryPhotoViewerPresentation.label(photo, index: index)
    }
}

private struct InventoryItemDetailPhotoPage: View {
    private enum LoadState {
        case waiting
        case shown(Data)
        case unavailable
    }

    let photo: InventoryDetailPhoto
    let data: Data?
    let load: InventoryPhotoLoader
    let onLoaded: (Data) -> Void
    @State private var state = LoadState.waiting
    @State private var retry = 0

    var body: some View {
        ZStack {
            Color.popsBackground
            switch state {
            case .waiting:
                InventoryPhotoPlaceholder(symbol: InventorySymbol.photo.system)
            case .shown(let data):
                PopsZoomablePhoto(
                    data: data,
                    placeholderSymbol: InventorySymbol.photo.system,
                    contentMode: .fit
                )
                .id(photo.id)
                .accessibilityHint(
                    "Pinch to zoom, drag to pan when zoomed, and swipe left or right for another photo"
                )
            case .unavailable:
                VStack(spacing: PopsSpacing.sm) {
                    Image(systemName: "photo.badge.exclamationmark")
                        .font(.popsTitle)
                        .foregroundStyle(Color.popsWarning)
                    Text("Photo unavailable")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                    Button("Try again") { retry += 1 }
                        .buttonStyle(.bordered)
                }
                .multilineTextAlignment(.center)
                .padding(PopsSpacing.lg)
            }
        }
        .task(id: "\(photo.sha256)-\(retry)") {
            state = .waiting
            guard
                let data = await InventoryPhotoViewerPresentation.loadData(
                    for: photo, cachedData: data, load: load)
            else {
                state = .unavailable
                return
            }
            guard !Task.isCancelled else { return }
            state = .shown(data)
            onLoaded(data)
        }
    }
}

private struct InventoryPhotoShareItem: Transferable {
    let data: Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .jpeg) { item in item.data }
    }
}
