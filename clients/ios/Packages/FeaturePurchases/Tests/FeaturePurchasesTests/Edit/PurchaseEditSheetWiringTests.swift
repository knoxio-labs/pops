import Foundation
import Testing

@Suite("Purchase edit sheet wiring")
internal struct PurchaseEditSheetWiringTests {
    private static let source: String = {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let path = packageRoot.appending(
            path: "Sources/FeaturePurchases/Capture/Edit/PurchaseEditSheet.swift")
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }()

    @Test("the shared form commits from the navigation bar with purchase locks")
    func sharedFormContract() {
        #expect(Self.source.contains("ReceiptDraftView("))
        #expect(Self.source.contains("savedPurchase: model.opened"))
        #expect(Self.source.contains("PurchaseEditPolicy.lock(for:"))
        #expect(Self.source.contains("PurchaseEditPolicy.canSave("))
        #expect(Self.source.contains("lineRemovalNotice: removalNotice"))
    }

    @Test("interactive dismissal is held only while an edit could be lost")
    func dismissalContract() {
        #expect(Self.source.contains(".interactiveDismissDisabled(model.changed || model.saving)"))
        #expect(Self.source.contains("if model.requestCancel() == .dismiss { dismiss() }"))
    }

    @Test("successful completion notifies the host before dismissal")
    func successfulCompletionOrder() throws {
        let callback = try #require(Self.source.range(of: "request.onSaved(saved)"))
        let dismissal = try #require(
            Self.source.range(of: "dismiss()", range: callback.upperBound..<Self.source.endIndex))

        #expect(callback.lowerBound < dismissal.lowerBound)
    }

    @Test("a failed save keeps both recovery actions")
    func failureActions() {
        #expect(Self.source.contains("Button(\"Keep editing\", role: .cancel)"))
        #expect(Self.source.contains("Button(\"Retry\")"))
    }
}
