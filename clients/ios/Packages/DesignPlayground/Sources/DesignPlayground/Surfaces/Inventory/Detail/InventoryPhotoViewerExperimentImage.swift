import CoreGraphics
import DesignSystem
import Foundation
import ImageIO
import SwiftUI

internal struct InventoryPhotoViewerExperimentImage: View {
    internal let photo: InventoryPhoto
    internal var zoomable = false

    internal var body: some View {
        Color.popsSurface
            .overlay {
                if photo.isBroken {
                    failureState
                } else if let data = photo.imageData, let image = decode(data) {
                    if zoomable {
                        InventoryPhotoZoomableImage(image: image, caption: photo.caption)
                    } else {
                        image
                            .resizable()
                            .scaledToFit()
                            .padding(PopsSpacing.md)
                    }
                } else {
                    loadingState
                }
            }
            .clipShape(
                RoundedRectangle(
                    cornerRadius: PopsRadius.control, style: .continuous))
    }

    private var failureState: some View {
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

    private var loadingState: some View {
        Image(systemName: "photo")
            .font(.popsLargeTitle)
            .foregroundStyle(Color.popsMutedForeground)
            .accessibilityLabel("Photo is loading")
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
