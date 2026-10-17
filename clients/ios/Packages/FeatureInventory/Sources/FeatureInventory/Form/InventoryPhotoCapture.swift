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
    ///
    /// `UIImagePickerController` is main-actor-isolated, so the check is
    /// too; every caller is UI code and already runs there.
    @MainActor
    internal enum InventoryCameraAvailability {
        internal static var isAvailable: Bool {
            UIImagePickerController.isSourceTypeAvailable(.camera)
        }
    }

    internal struct InventoryPhotoPicker: UIViewControllerRepresentable {
        internal let onPicked: (Data) -> Void
        internal let onCancel: () -> Void

        internal func makeUIViewController(context: Context) -> UIImagePickerController {
            let controller = UIImagePickerController()
            controller.sourceType = .camera
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

    @MainActor
    internal enum InventoryCameraAvailability {
        internal static var isAvailable: Bool { false }
    }

#endif

extension View {
    @ViewBuilder
    internal func inventoryPhotoPickerSheet(
        source: Binding<InventoryPhotoSource?>, selectionLimit: Int = 1,
        onPicked: @escaping ([Data]) -> Void
    ) -> some View {
        #if canImport(UIKit)
            fullScreenCover(item: source) { pickedSource in
                Group {
                    switch pickedSource {
                    case .camera:
                        InventoryPhotoPicker(
                            onPicked: {
                                onPicked([$0])
                                source.wrappedValue = nil
                            },
                            onCancel: { source.wrappedValue = nil })
                    case .library:
                        InventoryLibraryPhotoPicker(
                            selectionLimit: selectionLimit,
                            onPicked: {
                                onPicked($0)
                                source.wrappedValue = nil
                            })
                    }
                }
                .ignoresSafeArea()
            }
        #else
            self
        #endif
    }
}
