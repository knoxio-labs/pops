import Foundation
import SwiftUI
import Testing

@testable import FeatureInventory

/// A place page's Add and Store here: Add offers a new item or a new place,
/// and Store here goes straight to the existing-item list because Add
/// already offers the new item.
///
/// The sheets read `@State` and the environment, which a unit-test process
/// hosts no SwiftUI context for, so the wiring is read from source the same
/// way `InventoryItemDetailActionWiringTests` does.
@MainActor
@Suite("Place page Add and Store here")
internal struct InventoryLocationPageActionTests {
    private static func source(_ relativePath: String) -> String {
        let url = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appending(path: "Sources/FeatureInventory/\(relativePath)")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }

    private static let page = source("Locations/InventoryLocationPage.swift")
    private static let addSheet = source("Locations/InventoryLocationAddSheet.swift")
    private static let createSheet = source("Locations/InventoryLocationCreateSheet.swift")
    private static let itemForm = source("Form/InventoryItemFormView.swift")
    private static let itemFormPresentation = source("Form/InventoryItemFormPresentation.swift")
    private static let storeHereSheet = source("Picker/InventoryStoreHereSheet.swift")

    @Test("opened on the list, Store here is full height and cannot shrink to the choice")
    func existingStepIsLargeOnly() {
        #expect(InventoryStoreHereStep.existing.detent == .large)
        #expect(InventoryStoreHereStep.existing.detents == [.large])
    }

    @Test("opened on the scanner, Store here is full height and cannot shrink to the choice")
    func scanStepIsLargeOnly() {
        #expect(InventoryStoreHereStep.scan.detent == .large)
        #expect(InventoryStoreHereStep.scan.detents == [.large])
    }

    @Test("Store here's choice offers the scanner beside New item and Existing item")
    func choiceOffersScan() {
        #expect(Self.storeHereSheet.contains("show(.scan)"))
        #expect(
            Self.storeHereSheet.contains(
                "InventoryStoreScanModel(target: target, runner: runner)"))
    }

    @Test("opened on the choice, Store here is short and can grow to the list")
    func choiceStepGrowsToTheList() {
        let short = PresentationDetent.height(InventoryChoiceStep.sheetHeight)
        #expect(InventoryStoreHereStep.choice.detent == short)
        #expect(InventoryStoreHereStep.choice.detents == [short, .large])
    }

    @Test("the page's plus opens Add, not New place")
    func plusOpensAdd() {
        #expect(!Self.page.isEmpty, "InventoryLocationPage.swift is empty or missing")
        #expect(
            Self.page.contains(#"actionButton("Add", symbol: .addNew) { model.adding = true }"#))
        #expect(Self.page.contains("InventoryLocationAddSheet(tree: tree, place: place"))
        #expect(
            !Self.page.contains("InventoryLocationCreateSheet("),
            "the page still opens New place directly instead of through Add")
    }

    @Test("the page's Store here opens on the existing-item list")
    func storeHereSkipsTheChoice() {
        #expect(Self.page.contains("startingAt: .existing"))
    }

    @Test("Add offers the item form placed in the place, and New place inside it")
    func addOffersItemAndPlace() {
        #expect(!Self.addSheet.isEmpty, "InventoryLocationAddSheet.swift is empty or missing")
        #expect(Self.addSheet.contains("itemForm?(.create(placement: .location(place.id)))"))
        #expect(
            Self.addSheet.contains(
                "tree: tree, runner: runner, parentID: place.id, onCreated: onCreated"))
        #expect(
            Self.addSheet.contains(".inventoryItemFormPresentation("),
            Comment(
                rawValue:
                    "Add no longer installs its own item-form presentation, so New item would "
                    + "reach for an ancestor's sheet that this one covers"))
    }

    @Test("a created item closes the Add chooser")
    func createdItemDismissesAdd() {
        #expect(
            Self.addSheet.contains(
                ".inventoryItemFormPresentation(store: runner.store, onCreated: { dismiss() })"))
        #expect(Self.itemFormPresentation.contains("onCreated: onCreated"))
        #expect(Self.itemForm.contains("if model.mode == .create { onCreated() }"))
    }

    @Test("a created place closes the Add chooser")
    func createdPlaceDismissesAdd() {
        #expect(
            Self.addSheet.contains(
                "tree: tree, runner: runner, parentID: place.id, onCreated: onCreated"))
        #expect(Self.createSheet.contains("dismiss()\n            onCreated()"))
    }

    @Test("Store here's new item also closes its chooser")
    func storeHereCreatedItemDismissesChooser() {
        #expect(
            Self.storeHereSheet.contains(
                ".inventoryItemFormPresentation(store: runner.store, onCreated: { dismiss() })"))
    }

    @Test("nested item-form presenters inherit the server-backed code suggester")
    func nestedPresentationsInheritCodeSuggester() {
        #expect(
            Self.itemFormPresentation.contains(
                "@Environment(\\.inventoryCodeSuggester) private var inheritedSuggester"))
        #expect(
            Self.itemFormPresentation.contains(
                ".environment(\\.inventoryCodeSuggester, resolvedSuggester)"))
        #expect(Self.itemFormPresentation.contains("suggester: resolvedSuggester"))
    }
}
