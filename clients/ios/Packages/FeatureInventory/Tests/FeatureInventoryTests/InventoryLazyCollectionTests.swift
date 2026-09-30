import Foundation
import Testing

@testable import FeatureInventory

@Suite("Inventory lazy collections")
internal struct InventoryLazyCollectionTests {
    @Test("the row skeleton clamps empty and negative counts")
    @MainActor
    func skeletonCountIsNonnegative() {
        #expect(InventoryRowsSkeleton(rows: -1).rows == 0)
        #expect(InventoryRowsSkeleton(rows: 0).rows == 0)
        #expect(InventoryRowsSkeleton(rows: 1).rows == 1)
    }

    @Test("selection panels delegate row creation and transitions to the shared primitive")
    func selectionPanelUsesSharedDividedRows() throws {
        let source = try #require(Self.source("Components/InventorySelectionPanel.swift"))

        #expect(source.contains("PopsDividedRows(rows: rows, content: content)"))
        #expect(!source.contains("LazyVStack"))
    }

    @Test("loading rows preserve inventory row shape and shimmer")
    func rowSkeletonIsContentShaped() throws {
        let source = try #require(Self.source("Components/InventoryRowsSkeleton.swift"))

        #expect(source.contains("LazyVStack"))
        #expect(source.contains("RoundedRectangle"))
        #expect(source.contains("Capsule()"))
        #expect(source.contains(".popsShimmer()"))
        #expect(source.contains("max(rows, 0)"))
    }

    @Test("next-page states show a single row-shaped placeholder")
    func nextPageStatesUseSkeletonRows() throws {
        let browser = try #require(Self.source("Browse/InventoryItemsBrowserView.swift"))
        let history = try #require(Self.source("Lifecycle/InventoryItemHistoryView.swift"))
        let picker = try #require(Self.source("Picker/InventoryStoreHereSheet.swift"))

        #expect(browser.contains("InventoryRowsSkeleton(rows: 1)"))
        #expect(!browser.contains("ProgressView()"))
        #expect(history.contains("InventoryRowsSkeleton(rows: 1)"))
        #expect(!history.contains("ProgressView()"))
        #expect(picker.contains("InventoryRowsSkeleton(rows: 1, showsTrailingValue: false)"))
        #expect(!picker.contains("ProgressView()"))
    }

    @Test("standalone search result rows animate membership changes")
    func searchRowsAnimateChanges() throws {
        let source = try #require(Self.source("Search/InventorySearchRows.swift"))

        #expect(source.contains("LazyVStack"))
        #expect(source.contains(".transition(PopsMotion.row)"))
        #expect(source.contains(".popsMotion(value: results.map(\\.id))"))
    }

    @Test("record thumbnails start with the visible row and stop after cancellation")
    func thumbnailWorkFollowsRowLifecycle() throws {
        let row = try #require(Self.source("Search/InventorySearchResultRow.swift"))
        let mark = try #require(Self.source("Components/InventoryRecordMark.swift"))
        let placeholder = try #require(Self.source("Components/InventoryPhotoPlaceholder.swift"))

        #expect(row.contains("InventoryRecordMark("))
        #expect(mark.contains(".task(id: photo)"))
        #expect(mark.contains("await load(photo)"))
        #expect(mark.contains("guard !Task.isCancelled else { return }"))
        #expect(mark.contains("InventoryPhotoPlaceholder(symbol: symbol.system)"))
        #expect(placeholder.contains(".popsShimmer()"))

        let photoStrip = try #require(Self.source("Form/InventoryPhotoStrip.swift"))
        let thumbnailResult = try #require(
            photoStrip.range(of: "let loadedData = await thumbnail(photo.sha256)"))
        let cancellationGuard = try #require(
            photoStrip.range(of: "guard !Task.isCancelled else { return }"))
        let stateWrite = try #require(photoStrip.range(of: "data = loadedData"))

        #expect(thumbnailResult.lowerBound < cancellationGuard.lowerBound)
        #expect(cancellationGuard.lowerBound < stateWrite.lowerBound)
        #expect(!photoStrip.contains("data = await thumbnail(photo.sha256)"))
    }

    @Test("recently scanned tiles defer photo work and show an asset placeholder")
    func recentlyScannedPhotosFollowTileLifecycle() throws {
        let source = try #require(Self.source("Search/InventoryRecentSearches.swift"))

        #expect(source.contains("LazyHStack(alignment: .top"))
        #expect(source.contains(".task(id: record.photo)"))
        #expect(source.contains("guard !Task.isCancelled else { return }"))
        #expect(source.contains("InventoryPhotoPlaceholder(symbol: InventorySymbol.record"))
    }

    @Test("root loading replacements animate on phase changes with Reduce Motion support")
    func rootLoadingTransitionsFollowTheirPhases() throws {
        let screens = [
            ("Browse/InventoryItemsBrowserView.swift", ".popsMotion(value: model.phase)"),
            ("Dashboard/InventoryDashboardView.swift", ".popsMotion(value: model.phase)"),
            (
                "Containers/InventoryContainerBrowserView.swift",
                ".popsMotion(value: model.containers.phase)"
            ),
            (
                "Locations/InventoryLocationBrowserView.swift",
                ".popsMotion(value: model.tree.phase)"
            ),
            ("Containers/InventoryContainerPage.swift", ".popsMotion(value: phase)"),
            ("Locations/InventoryLocationPage.swift", ".popsMotion(value: model.tree.phase)"),
            (
                "Containers/InventoryOpenContainersView.swift",
                ".popsMotion(value: model.containers.phase)"
            ),
            ("InHand/InventoryInHandView.swift", ".popsMotion(value: model.phase)"),
        ]

        for (path, motion) in screens {
            let source = try #require(Self.source(path))
            #expect(source.contains(motion), "Missing phase animation in \(path)")
            #expect(source.contains(".transition(.opacity)"), "Missing replacement in \(path)")
        }

        let history = try #require(Self.source("Lifecycle/InventoryItemHistoryView.swift"))
        #expect(history.contains(".popsMotion(value: model.isLoading)"))
        #expect(history.contains("InventoryRowsSkeleton(rows: 8).transition(.opacity)"))

        let playgroundHistory = try #require(
            Self.playgroundSource(
                "Surfaces/Inventory/Lifecycle/InventoryItemHistoryView.swift"))
        #expect(playgroundHistory.contains(".inventoryMotion(value: isLoading)"))
        #expect(
            playgroundHistory.contains(
                "InventoryLocationListSkeleton(rows: 8).transition(.opacity)"))
    }

    @Test("picker loading replacements animate with their loading values")
    func pickerLoadingTransitionsFollowTheirPhases() throws {
        let storePicker = try #require(Self.source("Picker/InventoryStoreHereSheet.swift"))
        let destinationPicker = try #require(Self.source("Picker/InventoryDestinationLevel.swift"))

        #expect(storePicker.contains(".popsMotion(value: model.candidates)"))
        #expect(storePicker.contains("InventoryRowsSkeleton(rows: 6, showsTrailingValue: false)"))
        #expect(storePicker.contains(".transition(.opacity)"))
        #expect(destinationPicker.contains(".popsMotion(value: isLoading)"))
        #expect(
            destinationPicker.contains("InventoryRowsSkeleton(rows: 6, showsTrailingValue: false)"))
        #expect(destinationPicker.contains(".transition(.opacity)"))
    }

    private static func source(_ relativePath: String) -> String? {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/\(relativePath)")
        return try? String(contentsOf: path, encoding: .utf8)
    }

    private static func playgroundSource(_ relativePath: String) -> String? {
        let path = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "DesignPlayground/Sources/DesignPlayground/\(relativePath)")
        return try? String(contentsOf: path, encoding: .utf8)
    }
}
