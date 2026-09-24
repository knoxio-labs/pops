#if canImport(PhotosUI)

    import PhotosUI
    import SwiftUI

    internal struct ReceiptPhotoPickerModifier: ViewModifier {
        @Binding private var isPresented: Bool
        @State private var selection: [PhotosPickerItem] = []
        @State private var dismissal = PhotoPickerDismissal()

        private let selectionLimit: Int
        private let onPicked: @MainActor ([PhotosPickerItem]) -> Void
        private let onCancel: @MainActor () -> Void

        internal init(
            isPresented: Binding<Bool>,
            selectionLimit: Int,
            onPicked: @escaping @MainActor ([PhotosPickerItem]) -> Void,
            onCancel: @escaping @MainActor () -> Void
        ) {
            _isPresented = isPresented
            self.selectionLimit = selectionLimit
            self.onPicked = onPicked
            self.onCancel = onCancel
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
                    dismissal.selectionArrived()
                    onPicked(items)
                    selection = []
                }
                .onChange(of: isPresented) { _, presented in
                    guard !presented else { return }
                    // PhotosPicker does not document whether a pick publishes its selection
                    // before or after it clears isPresented, so settle on the next main-actor
                    // turn, once a selection from the same update has arrived.
                    Task { @MainActor in
                        if dismissal.settle() { onCancel() }
                    }
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
            onPicked: @escaping @MainActor ([PhotosPickerItem]) -> Void,
            onCancel: @escaping @MainActor () -> Void
        ) -> some View {
            modifier(
                ReceiptPhotoPickerModifier(
                    isPresented: isPresented,
                    selectionLimit: selectionLimit,
                    onPicked: onPicked,
                    onCancel: onCancel))
        }
    }

#endif
