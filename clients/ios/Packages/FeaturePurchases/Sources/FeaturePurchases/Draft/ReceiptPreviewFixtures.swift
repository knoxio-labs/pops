#if DEBUG

    import AppCore
    import CoreGraphics
    import Foundation
    import ImageIO
    import UniformTypeIdentifiers

    /// A fictional receipt, shared by every `#Preview` in this module that
    /// needs one — the draft form's, hand entry's, and review's.
    ///
    /// `#Preview` is compiled into the module it previews, so a fake in a
    /// separate target is not reachable from one; `#if DEBUG` keeps it out of
    /// anything shipped.
    internal enum PreviewReceipt {
        static let purchase = ReceiptPurchase(
            id: "pur_01JQ8XN4E7K2M9V3ZB6TYD",
            merchantName: "Woolworths Metro",
            total: MoneyAmount(minorUnits: 8423, currencyCode: "AUD"),
            orderedAt: "2026-08-19T09:14:00.000Z",
            itemCount: 12
        )

        static let extracted = ExtractedReceipt(
            merchantName: "Woolworths Metro",
            address: "412 Crown Street, Surry Hills NSW",
            purchasedOn: "2026-08-19",
            purchasedAt: "09:14",
            currency: "AUD",
            total: "84.23",
            tax: "7.66",
            discounts: ["2.00"],
            surcharges: ["0.03"],
            shipping: nil,
            lines: [
                ExtractedReceiptLine(
                    description: "Full cream milk 2L", amount: "4.50", quantity: 2,
                    unitNote: nil, listAmount: nil),
                ExtractedReceiptLine(
                    description: "Sourdough loaf", amount: "6.00", quantity: nil, unitNote: nil,
                    listAmount: nil),
                ExtractedReceiptLine(
                    description: "Royal gala apples", amount: "7.84", quantity: nil,
                    unitNote: "$4.90/kg", listAmount: nil),
                ExtractedReceiptLine(
                    description: "Free range eggs 12pk", amount: "9.20", quantity: nil,
                    unitNote: nil, listAmount: nil),
            ],
            unreadableNotes: ["The line under the eggs is torn away."],
            taxIncluded: false,
            discountIncluded: false,
            surchargeIncluded: false,
            shippingIncluded: false
        )

        static let failures = [
            ReceiptGateFailure(
                kind: .sumMismatch,
                detail: "Lines and adjustments came to 81.73 against a printed 84.23",
                deltaCents: -250),
            ReceiptGateFailure(
                kind: .unreadableLine, detail: "One line below the eggs could not be read",
                deltaCents: nil),
        ]

        /// Pages that actually draw, so a preview shows the design's
        /// centrepiece rather than a row of placeholders. Synthesised rather
        /// than checked in as a fixture image: a receipt photograph in the
        /// repository is somebody's real shopping, and this needs to look like
        /// paper rather than be any.
        static func pages(_ count: Int) -> [ReceiptPart] {
            (0..<count).compactMap { index in
                PreviewPaper.jpegData(seed: index).map {
                    ReceiptPart(mediaType: .jpeg, data: $0)
                }
            }
        }
    }

    /// A drawing of a till receipt: a pale page with darker bars where the
    /// print would be. Enough for a preview to show what the plate does with
    /// a real photograph in it.
    private enum PreviewPaper {
        static func jpegData(seed: Int) -> Data? {
            let width = 240
            let height = 360
            guard
                let context = CGContext(
                    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return nil }

            context.setFillColor(red: 0.96, green: 0.95, blue: 0.92, alpha: 1)
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            context.setFillColor(red: 0.25, green: 0.24, blue: 0.22, alpha: 1)

            var line = height - 40
            var index = 0
            while line > 24 {
                let inset = 24
                let barWidth = (index + seed) % 3 == 0 ? width - inset * 2 : width / 2
                context.fill(CGRect(x: inset, y: line, width: barWidth, height: 6))
                line -= 22
                index += 1
            }

            guard let image = context.makeImage() else { return nil }
            let encoded = NSMutableData()
            guard
                let destination = CGImageDestinationCreateWithData(
                    encoded, UTType.jpeg.identifier as CFString, 1, nil)
            else { return nil }
            CGImageDestinationAddImage(destination, image, nil)
            guard CGImageDestinationFinalize(destination) else { return nil }
            return encoded as Data
        }
    }

#endif
