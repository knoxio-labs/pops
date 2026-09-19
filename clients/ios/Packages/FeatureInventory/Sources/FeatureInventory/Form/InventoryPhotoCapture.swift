import Foundation
import SwiftUI

/// Where a captured photo's bytes come from: the tile offers both whenever
/// the device has a camera, and only the library otherwise.
internal enum InventoryPhotoSource: String, Identifiable {
    case camera
    case library

    internal var id: String { rawValue }
}

#if canImport(UIKit)

    import UIKit

    /// Whether this device can take a picture at all — a simulator or an
    /// iPad without a rear camera cannot, and the capture tile's menu should
    /// never offer a source that only shows an system alert.
    internal enum InventoryCameraAvailability {
        internal static var isAvailable: Bool {
            UIImagePickerController.isSourceTypeAvailable(.camera)
        }
    }

    /// `UIImagePickerController`, for both sources: SwiftUI's own
    /// `PhotosPicker` covers the library alone, and there is no first-party
    /// SwiftUI camera capture on this project's SDK floor.
    internal struct InventoryPhotoPicker: UIViewControllerRepresentable {
        internal let source: InventoryPhotoSource
        internal let onPicked: (Data) -> Void
        internal let onCancel: () -> Void

        internal func makeUIViewController(context: Context) -> UIImagePickerController {
            let controller = UIImagePickerController()
            controller.sourceType = source == .camera ? .camera : .photoLibrary
            controller.delegate = context.coordinator
            return controller
        }

        internal func updateUIViewController(
            _ controller: UIImagePickerController, context: Context
        ) {}

        internal func makeCoordinator() -> Coordinator {
            Coordinator(onPicked: onPicked, onCancel: onCancel)
        }

        internal final class Coordinator: NSObject, UIImagePickerControllerDelegate,
            UINavigationControllerDelegate
        {
            private let onPicked: (Data) -> Void
            private let onCancel: () -> Void

            internal init(onPicked: @escaping (Data) -> Void, onCancel: @escaping () -> Void) {
                self.onPicked = onPicked
                self.onCancel = onCancel
            }

            internal func imagePickerController(
                _ picker: UIImagePickerController,
                didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
            ) {
                guard
                    let image = info[.originalImage] as? UIImage,
                    let jpeg = InventoryPhotoEncoding.jpeg(from: image)
                else {
                    onCancel()
                    return
                }
                onPicked(jpeg)
            }

            internal func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
                onCancel()
            }
        }
    }

#else

    internal enum InventoryCameraAvailability {
        internal static var isAvailable: Bool { false }
    }

#endif

extension View {
    /// Presents the system image picker for whichever source `source`
    /// names, and clears it however the picker ends: a photo picked, or the
    /// person backing out. On the host toolchain (no `UIKit`) this is a
    /// no-op — nothing ships that ever sets `source` there.
    @ViewBuilder
    internal func inventoryPhotoPickerSheet(
        source: Binding<InventoryPhotoSource?>, onPicked: @escaping (Data) -> Void
    ) -> some View {
        #if canImport(UIKit)
            fullScreenCover(item: source) { pickedSource in
                InventoryPhotoPicker(
                    source: pickedSource,
                    onPicked: {
                        source.wrappedValue = nil
                        onPicked($0)
                    },
                    onCancel: { source.wrappedValue = nil }
                )
                .ignoresSafeArea()
            }
        #else
            self
        #endif
    }
}
