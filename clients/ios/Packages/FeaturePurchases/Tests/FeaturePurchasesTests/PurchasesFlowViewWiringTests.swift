import Foundation
import Testing

@Suite("Purchases flow wiring")
internal struct PurchasesFlowViewWiringTests {
    private static func source(_ relativePath: String) -> String {
        let packageRoot = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let path = packageRoot.appending(path: relativePath)
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }

    private static let flow = source("Sources/FeaturePurchases/PurchasesFlowView.swift")
    private static let destination = source(
        "Sources/FeaturePurchases/PurchasesDestinationView.swift")

    @Test("the scan reads both flow source files")
    func sourceFilesExist() {
        #expect(!Self.flow.isEmpty)
        #expect(!Self.destination.isEmpty)
    }

    @Test("the Purchases flow owns exactly one navigation stack")
    func flowOwnsOneStack() {
        #expect(Self.flow.components(separatedBy: "NavigationStack").count - 1 == 1)
    }

    @Test("the destination switch exhaustively names both screen routes")
    func destinationIsExhaustive() {
        #expect(Self.destination.contains("switch route"))
        #expect(Self.destination.contains("case .archive"))
        #expect(Self.destination.contains("case .detail"))
        #expect(!Self.destination.contains("default:"))
    }

    @Test("capture completion lands saved identifiers on the owned home model")
    func captureCompletionLandsOnHome() {
        #expect(Self.flow.contains(".purchaseCapturePresentation("))
        #expect(Self.flow.contains("await home.land(savedIDs: savedIDs)"))
    }
}
