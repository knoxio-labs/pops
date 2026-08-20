#if DEBUG

    import AppCore
    import CoreGraphics
    import Foundation
    import ImageIO
    import SwiftUI
    import UniformTypeIdentifiers

    /// A repository for the canvas, and the only reason it sits in `Sources`
    /// rather than a test-support target: `#Preview` is compiled into the
    /// module it previews, so a fake in a separate target is not reachable
    /// from one. `#if DEBUG` keeps it out of anything shipped, and
    /// `ModuleBoundaryTests.fakesAreTestOnly` keeps `AppCoreFakes` out of here.
    private struct PreviewReceiptCaptureRepository: ReceiptCaptureRepository {
        let answer: Result<ReceiptOutcome, RepositoryError>
        /// Never answers, so the canvas holds on the submitting state. A
        /// `Task.sleep` rather than a continuation nobody resumes, because the
        /// canvas going away cancels the task and the model treats that as the
        /// non-event it is.
        var neverAnswers = false

        func capture(_ parts: [ReceiptPart]) async throws -> ReceiptOutcome {
            if neverAnswers { try await Task.sleep(for: .seconds(3600)) }
            return try answer.get()
        }
    }

    private enum PreviewReceipt {
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
                    unitNote: nil),
                ExtractedReceiptLine(
                    description: "Sourdough loaf", amount: "6.00", quantity: nil, unitNote: nil),
                ExtractedReceiptLine(
                    description: "Royal gala apples", amount: "7.84", quantity: nil,
                    unitNote: "$4.90/kg"),
                ExtractedReceiptLine(
                    description: "Free range eggs 12pk", amount: "9.20", quantity: nil,
                    unitNote: nil),
            ],
            unreadableNotes: ["The line under the eggs is torn away."]
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

        /// Pages that actually draw, so the canvas shows the design's
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
    /// print would be. Enough for the canvas to show what the plate does with
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

    @MainActor
    private func previewCaptureModel(access: CameraAccess) -> ReceiptCaptureViewModel {
        let model = ReceiptCaptureViewModel(
            dependencies: .unbound, camera: PreviewCameraAuthorization(standing: access))
        model.refreshCameraAccess()
        return model
    }

    /// The camera answer the canvas asks for. `AppCoreFakes`' stub is the same
    /// idea and is test-only, for the reason the repository above is redeclared
    /// here.
    private struct PreviewCameraAuthorization: CameraAuthorizing {
        let standing: CameraAccess

        func currentAccess() -> CameraAccess { standing }
        func requestAccess() async -> CameraAccess { standing }
    }

    @MainActor
    private func previewResultModel(
        pages: Int = 2,
        answering answer: Result<ReceiptOutcome, RepositoryError>,
        neverAnswers: Bool = false
    ) -> ReceiptResultViewModel {
        ReceiptResultViewModel(
            parts: PreviewReceipt.pages(pages),
            dependencies: AppDependencies(
                transactions: AppDependencies.unbound.transactions,
                pairing: AppDependencies.unbound.pairing,
                reachability: AppDependencies.unbound.reachability,
                receiptCapture: PreviewReceiptCaptureRepository(
                    answer: answer, neverAnswers: neverAnswers)
            )
        )
    }

    #Preview("Capture — camera available") {
        ReceiptCaptureView(model: previewCaptureModel(access: .authorized))
    }

    /// The refusal with somewhere to go, and the only one the action bar
    /// offers a control for.
    #Preview("Capture — camera denied") {
        ReceiptCaptureView(model: previewCaptureModel(access: .denied))
    }

    /// What every Simulator, and therefore every hosted UI flow, actually
    /// meets. It must be a drawn screen rather than a blank one.
    #Preview("Capture — no camera") {
        ReceiptCaptureView(model: previewCaptureModel(access: .unavailable))
    }

    /// The size the capture screen has to survive: a refusal, a heading and a
    /// guidance card, with the action still reachable because the bar does not
    /// scroll.
    #Preview("Capture — accessibility text size") {
        ReceiptCaptureView(model: previewCaptureModel(access: .denied))
            .dynamicTypeSize(.accessibility5)
    }

    #Preview("Result — created") {
        ReceiptResultView(
            model: previewResultModel(
                pages: 1,
                answering: .success(
                    .created(purchase: PreviewReceipt.purchase, alreadyStored: false))))
    }

    /// A re-upload of bytes already on file. Not a duplicate purchase, and the
    /// screen must not say it saved twice.
    #Preview("Result — created, already on file") {
        ReceiptResultView(
            model: previewResultModel(
                pages: 1,
                answering: .success(
                    .created(purchase: PreviewReceipt.purchase, alreadyStored: true))))
    }

    /// The screen the whole tri-state exists for: a real purchase whose
    /// numbers a person has to settle, laid out so the reading can be run
    /// against the photograph beside it.
    #Preview("Result — needs review") {
        ReceiptResultView(
            model: previewResultModel(
                answering: .success(
                    .needsReview(
                        receiptCount: 2, failures: PreviewReceipt.failures,
                        extracted: PreviewReceipt.extracted))))
    }

    /// The same screen at the text size the layout has to survive — where a
    /// line item's description and its amount stop fitting on one row.
    #Preview("Result — needs review, accessibility text size") {
        ReceiptResultView(
            model: previewResultModel(
                answering: .success(
                    .needsReview(
                        receiptCount: 2, failures: PreviewReceipt.failures,
                        extracted: PreviewReceipt.extracted)))
        )
        .dynamicTypeSize(.accessibility5)
    }

    #Preview("Result — unreadable") {
        ReceiptResultView(
            model: previewResultModel(
                pages: 1,
                answering: .success(
                    .unreadable(
                        receiptCount: 1,
                        reason: "The image is too blurred for any line to be read."))))
    }

    #Preview("Result — reading") {
        ReceiptResultView(
            model: previewResultModel(
                answering: .success(
                    .created(purchase: PreviewReceipt.purchase, alreadyStored: false)),
                neverAnswers: true))
    }

    /// The receipt never reached the pillar. The pages stay on screen, because
    /// nothing about them is known to be wrong and the retry sends the same
    /// bytes.
    #Preview("Result — gateway failure") {
        ReceiptResultView(model: previewResultModel(answering: .failure(.unavailable)))
    }

#endif
