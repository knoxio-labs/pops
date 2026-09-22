import Foundation
import Testing

@testable import FeaturePurchases

@Suite("Purchases home wiring")
internal struct PurchasesHomeWiringTests {
    private static let packageRoot = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
    private static let screen = source("Sources/FeaturePurchases/Home/PurchasesHomeScreen.swift")
    private static let controls = source(
        "Sources/FeaturePurchases/Home/PurchasesCaptureControls.swift")
    private static let tiles = source("Sources/FeaturePurchases/Home/PurchasesHomeTiles.swift")

    @Test("the home reads the capture presenter directly from its environment")
    func readsCapturePresenter() {
        #expect(Self.screen.contains("@Environment(\\.purchaseCapture)"))
        #expect(Self.controls.contains("PurchaseCapturePresenter"))
        #expect(!Self.screen.contains("onSaved:"))
        #expect(!Self.controls.contains("onSaved:"))
    }

    @Test("Add uses the exact ordered non-scan source collection")
    func addSources() {
        #expect(Self.controls.contains("ForEach(PurchaseCaptureSource.added)"))
        #expect(PurchaseCaptureSource.added == [.photos, .file, .hand])
    }

    @Test("Scan is the purchases-tinted direct action")
    func scanTreatment() {
        #expect(Self.controls.contains("presenter(.scan)"))
        #expect(Self.controls.contains(".foregroundStyle(Color.popsPurchases)"))
    }

    @Test("capture controls require both loaded content and a bound presenter")
    func controlsRequireLoadedPresenter() {
        #expect(
            Self.screen.contains(
                "if case .loaded = model.phase, let purchaseCapture"))
    }

    @Test("the loaded empty state keeps refresh and refresh-failure feedback")
    func emptyStateRefreshes() {
        #expect(Self.screen.contains("private func loaded("))
        #expect(Self.screen.contains("if digest.allCount == 0"))
        #expect(Self.screen.contains("PurchasesRefreshCapsule(refresh: refresh)"))
        #expect(Self.screen.contains(".refreshable { await model.refresh() }"))
        guard let emptyBranch = Self.screen.range(of: "if digest.allCount == 0")?.lowerBound,
            let refreshable = Self.screen.range(
                of: ".refreshable { await model.refresh() }")?.lowerBound
        else {
            Issue.record("Expected the empty branch and shared refresh modifier")
            return
        }
        #expect(refreshable > emptyBranch)
    }

    @Test("archive tiles and recent rows use feature-local destinations")
    func destinations() {
        #expect(Self.tiles.contains("PurchasesScreenRoute.archive(.all)"))
        #expect(Self.tiles.contains("PurchasesScreenRoute.archive(.unmatched)"))
        #expect(Self.screen.contains("PurchasesScreenRoute.detail(purchase.id)"))
    }

    @Test("the old list and its model are absent")
    func oldListIsGone() {
        let oldFiles = [
            "Sources/FeaturePurchases/PurchasesListView.swift",
            "Sources/FeaturePurchases/PurchasesListViewModel.swift",
            "Tests/FeaturePurchasesTests/PurchasesListViewModelTests.swift",
        ]
        for path in oldFiles {
            #expect(
                !FileManager.default.fileExists(atPath: Self.packageRoot.appending(path: path).path)
            )
        }
    }

    @Test("home controls and destinations have distinct accessibility identities")
    func accessibilityIdentities() {
        let identifiers = [
            PurchasesAccessibility.homeRoot,
            PurchasesAccessibility.allTile,
            PurchasesAccessibility.unmatchedTile,
            PurchasesAccessibility.listPicker,
            PurchasesAccessibility.add,
            PurchaseCaptureSource.scan.accessibilityIdentifier,
            PurchasesAccessibility.row("one"),
            PurchasesAccessibility.highlightedRow("one"),
        ]
        #expect(Set(identifiers).count == identifiers.count)
        #expect(
            Self.controls.contains(
                ".accessibilityIdentifier(source.accessibilityIdentifier)"))
        #expect(
            Self.controls.contains(
                ".accessibilityIdentifier(PurchaseCaptureSource.scan.accessibilityIdentifier)"))
    }

    private static func source(_ relativePath: String) -> String {
        let path = packageRoot.appending(path: relativePath)
        return (try? String(contentsOf: path, encoding: .utf8)) ?? ""
    }
}
