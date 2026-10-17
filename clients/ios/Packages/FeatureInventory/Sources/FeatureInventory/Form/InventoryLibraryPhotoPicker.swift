#if canImport(UIKit)
    import PhotosUI
    import SwiftUI
    import UniformTypeIdentifiers

    internal struct InventoryLibraryPhotoPicker: UIViewControllerRepresentable {
        internal let selectionLimit: Int
        internal let onPicked: ([Data]) -> Void

        internal static func configuration(selectionLimit: Int) -> PHPickerConfiguration {
            var configuration = PHPickerConfiguration()
            configuration.filter = .images
            configuration.selectionLimit = selectionLimit
            configuration.selection = .ordered
            return configuration
        }

        internal func makeUIViewController(context: Context) -> PHPickerViewController {
            let controller = PHPickerViewController(
                configuration: Self.configuration(selectionLimit: selectionLimit))
            controller.delegate = context.coordinator
            return controller
        }

        internal func updateUIViewController(
            _ controller: PHPickerViewController, context: Context
        ) {}

        internal func makeCoordinator() -> Coordinator {
            Coordinator(onPicked: onPicked)
        }

        @MainActor
        internal final class Coordinator: NSObject, PHPickerViewControllerDelegate {
            private let onPicked: ([Data]) -> Void

            internal init(onPicked: @escaping ([Data]) -> Void) {
                self.onPicked = onPicked
            }

            internal func picker(
                _ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]
            ) {
                Task {
                    onPicked(await Self.loadPhotos(results.map(\.itemProvider)))
                }
            }

            internal static func loadPhotos(_ providers: [NSItemProvider]) async -> [Data] {
                var photos: [Data] = []
                for provider in providers {
                    let data: Data? = await withCheckedContinuation { continuation in
                        provider.loadDataRepresentation(
                            forTypeIdentifier: UTType.image.identifier
                        ) { data, _ in
                            continuation.resume(returning: data)
                        }
                    }
                    if let data, let image = UIImage(data: data),
                        let jpeg = InventoryPhotoEncoding.jpeg(from: image)
                    {
                        photos.append(jpeg)
                    }
                }
                return photos
            }
        }
    }
#endif
