#if canImport(UIKit)

    import AppCore
    import CoreGraphics
    import UIKit

    /// A photographed page, as bytes a repository takes.
    ///
    /// Whole-file `#if` for the same reason `FeaturePairing`'s scanner has one:
    /// there is no honest macOS build of this, and a stub that compiled would be
    /// something a host-toolchain test could pass against. Every *decision* this
    /// feature makes about pages — how many are too many, what a page that
    /// could not be prepared means — lives outside this file, in
    /// ``ReceiptCaptureViewModel`` and ``ReceiptPageBudget``.
    internal enum ReceiptPageEncoder {
        /// Every page that could be prepared, in the order given.
        ///
        /// Silently shorter than its input when a page fails, which is why the
        /// caller passes the original count on to the model rather than
        /// counting what came back: dropping a page of a receipt has to be
        /// caught, and this is not the layer that knows it matters.
        internal static func parts(
            from pages: [UIImage],
            budget: ReceiptPageBudget = .standard
        ) -> [ReceiptPart] {
            pages.compactMap { part(from: $0, budget: budget) }
        }

        /// One page, or `nil` when it could not be encoded at all.
        internal static func part(
            from page: UIImage,
            budget: ReceiptPageBudget = .standard
        ) -> ReceiptPart? {
            guard let data = fitted(page, to: budget).jpegData(compressionQuality: budget.compressionQuality),
                !data.isEmpty
            else { return nil }
            return ReceiptPart(mediaType: .jpeg, data: data)
        }

        /// The page redrawn inside the budget, or the page itself when it
        /// already is.
        ///
        /// The renderer's format is given an explicit scale of 1 because
        /// `UIGraphicsImageRenderer` otherwise draws at the screen's scale —
        /// which on a phone would produce two or three times the pixels asked
        /// for and quietly undo the budget.
        private static func fitted(_ page: UIImage, to budget: ReceiptPageBudget) -> UIImage {
            let pixels = CGSize(
                width: page.size.width * page.scale,
                height: page.size.height * page.scale
            )
            let target = budget.fittedSize(for: pixels)
            guard target != pixels else { return page }

            let format = UIGraphicsImageRendererFormat.preferred()
            format.scale = 1
            return UIGraphicsImageRenderer(size: target, format: format).image { _ in
                page.draw(in: CGRect(origin: .zero, size: target))
            }
        }
    }

#endif
