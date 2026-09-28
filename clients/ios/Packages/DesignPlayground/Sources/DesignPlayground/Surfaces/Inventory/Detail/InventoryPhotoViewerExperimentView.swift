import CoreGraphics
import DesignSystem
import Foundation
import ImageIO
import SwiftUI

internal enum InventoryPhotoViewerDesignPresentation {
    case fullScreen
    case sheet
}

private enum InventoryPhotoPreviewState: String, CaseIterable, Identifiable {
    case ready
    case loading
    case unavailable

    var id: Self { self }

    var title: String {
        switch self {
        case .ready: "Ready"
        case .loading: "Loading"
        case .unavailable: "Unavailable"
        }
    }

    var symbol: String {
        switch self {
        case .ready: "photo"
        case .loading: "arrow.clockwise"
        case .unavailable: "photo.badge.exclamationmark"
        }
    }
}

internal struct InventoryPhotoViewerExperimentView: View {
    internal let presentation: InventoryPhotoViewerDesignPresentation
    @State private var previewState: InventoryPhotoPreviewState = .ready
    @State private var viewing: InventoryPhoto?

    internal var body: some View {
        presentedSurface
    }

    private var photos: [InventoryPhoto] {
        switch previewState {
        case .ready:
            InventoryItemDetailFixtures.rich.photos
        case .loading:
            InventoryItemDetailFixtures.rich.photos.map {
                InventoryPhoto(caption: $0.caption, isBroken: false)
            }
        case .unavailable:
            InventoryItemDetailFixtures.brokenPhoto.photos
        }
    }

    @ViewBuilder private var presentedSurface: some View {
        switch presentation {
        case .fullScreen:
            surface.popsStage(item: $viewing) { photo in
                InventoryPhotoViewerExperimentViewer(
                    photos: photos, opening: photo, presentation: presentation)
            }
        case .sheet:
            surface.sheet(item: $viewing) { photo in
                InventoryPhotoViewerExperimentViewer(
                    photos: photos, opening: photo, presentation: presentation
                )
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
            }
        }
    }

    private var surface: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                    Text("Inspect every angle before you act")
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsMutedForeground)

                    Button {
                        viewing = photos.first
                    } label: {
                        InventoryPhotoViewerExperimentImage(photo: photos[0])
                            .frame(maxWidth: .infinity)
                            .frame(height: PopsSize.pageHeight * 1.2)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Open photos")

                    VStack(alignment: .leading, spacing: PopsSpacing.xs) {
                        Text("Espresso machine")
                            .font(.popsTitle)
                            .foregroundStyle(Color.popsForeground)
                        Text("\(photos.count) photos")
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                    }

                    ScrollView(.horizontal) {
                        HStack(spacing: PopsSpacing.sm) {
                            ForEach(photos) { photo in
                                Button {
                                    viewing = photo
                                } label: {
                                    InventoryPhotoViewerExperimentImage(photo: photo)
                                        .frame(
                                            width: PopsSize.countField,
                                            height: PopsSize.countField)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(photo.caption)
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                }
                .padding(PopsSpacing.lg)
            }
            .background(Color.popsBackground)
            .navigationTitle("Espresso machine")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu("Preview state", systemImage: "slider.horizontal.3") {
                        ForEach(InventoryPhotoPreviewState.allCases) { state in
                            Button {
                                previewState = state
                            } label: {
                                Label(state.title, systemImage: state.symbol)
                            }
                        }
                    }
                }
            }
        }
    }
}

private struct InventoryPhotoViewerExperimentViewer: View {
    let photos: [InventoryPhoto]
    let opening: InventoryPhoto
    let presentation: InventoryPhotoViewerDesignPresentation
    @Environment(\.dismiss) private var dismiss
    @State private var selectedID: String?

    init(
        photos: [InventoryPhoto], opening: InventoryPhoto,
        presentation: InventoryPhotoViewerDesignPresentation
    ) {
        self.photos = photos
        self.opening = opening
        self.presentation = presentation
        _selectedID = State(initialValue: opening.id)
    }

    private var currentIndex: Int {
        guard let selectedID else { return 0 }
        return photos.firstIndex { $0.id == selectedID } ?? 0
    }

    private var current: InventoryPhoto { photos[currentIndex] }

    var body: some View {
        NavigationStack {
            VStack(spacing: PopsSpacing.md) {
                pager
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                VStack(spacing: PopsSpacing.xs) {
                    Text(current.caption)
                        .font(.popsSubheadline)
                        .foregroundStyle(Color.popsForeground)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                    Text("\(currentIndex + 1) of \(photos.count)")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    "Photo \(currentIndex + 1) of \(photos.count), \(current.caption)")
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.lg)
            .background(Color.popsBackground)
            .navigationTitle("Photos")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    HStack(spacing: PopsSpacing.sm) {
                        Button("Share", systemImage: "square.and.arrow.up") {}
                        Menu("More", systemImage: "ellipsis") {
                            Button("Retake") {}
                            Button("Delete", role: .destructive) {}
                        }
                    }
                }
            }
        }
        .preferredColorScheme(presentation == .fullScreen ? .dark : nil)
    }

    private var pager: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: PopsSpacing.zero) {
                ForEach(photos) { photo in
                    InventoryPhotoViewerExperimentImage(photo: photo)
                        .containerRelativeFrame(.horizontal)
                        .id(photo.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollPosition(id: $selectedID)
        .scrollTargetBehavior(.paging)
        .scrollIndicators(.hidden)
        .accessibilityLabel("Swipe between photos")
    }
}

private struct InventoryPhotoViewerExperimentImage: View {
    let photo: InventoryPhoto

    var body: some View {
        Color.popsSurface
            .overlay {
                if photo.isBroken {
                    VStack(spacing: PopsSpacing.xs) {
                        Image(systemName: "photo.badge.exclamationmark")
                            .font(.popsTitle)
                            .foregroundStyle(Color.popsWarning)
                        Text("Couldn't load")
                            .font(.popsCaption)
                            .foregroundStyle(Color.popsMutedForeground)
                    }
                    .accessibilityLabel("Photo failed to load")
                } else if let data = photo.imageData, let image = decode(data) {
                    image
                        .resizable()
                        .scaledToFit()
                        .padding(PopsSpacing.md)
                } else {
                    Image(systemName: "photo")
                        .font(.popsLargeTitle)
                        .foregroundStyle(Color.popsMutedForeground)
                        .accessibilityLabel("Photo is loading")
                }
            }
            .clipShape(
                RoundedRectangle(
                    cornerRadius: PopsRadius.control, style: .continuous))
    }

    private func decode(_ data: Data) -> Image? {
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
}
