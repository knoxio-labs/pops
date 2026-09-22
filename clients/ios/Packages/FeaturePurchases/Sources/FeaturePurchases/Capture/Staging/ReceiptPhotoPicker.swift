#if canImport(PhotosUI)

    import PhotosUI
    import SwiftUI

    internal struct ReceiptPhotoPickerModifier: ViewModifier {
        @Binding private var isPresented: Bool
        @State private var selection: [PhotosPickerItem] = []

        private let selectionLimit: Int
        private let onPicked: @MainActor ([PhotosPickerItem]) -> Void

        internal init(
            isPresented: Binding<Bool>,
            selectionLimit: Int,
            onPicked: @escaping @MainActor ([PhotosPickerItem]) -> Void
        ) {
            _isPresented = isPresented
            self.selectionLimit = selectionLimit
            self.onPicked = onPicked
        }

        internal func body(content: Content) -> some View {
            content
                .photosPicker(
                    isPresented: $isPresented,
                    selection: $selection,
                    maxSelectionCount: selectionLimit,
                    matching: .any(of: [.images, .screenshots])
                )
                .onChange(of: selection) { _, items in
                    guard !items.isEmpty else { return }
                    onPicked(items)
                    selection = []
                }
        }
    }

    extension View {
        /// Presents the system multi-photo picker and reports each selection in picker order.
        ///
        /// The caller loads each item's data and converts it through
        /// `ReceiptStagingConversion`; presentation and conversion stay independently testable.
        internal func receiptPhotoPicker(
            isPresented: Binding<Bool>,
            selectionLimit: Int = 0,
            onPicked: @escaping @MainActor ([PhotosPickerItem]) -> Void
        ) -> some View {
            modifier(
                ReceiptPhotoPickerModifier(
                    isPresented: isPresented,
                    selectionLimit: selectionLimit,
                    onPicked: onPicked))
        }
    }

#endif
