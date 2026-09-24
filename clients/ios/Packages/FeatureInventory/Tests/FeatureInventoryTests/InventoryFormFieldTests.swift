import AppCore
import Testing

@testable import FeatureInventory

@Suite("Item form: fields rendered from the catalogue")
internal struct InventoryFormFieldTests {
    @Test("a choice field offers only the values its type declares")
    func choiceOffersOnlyDeclaredValues() {
        #expect(
            InventoryFormChoices.options(for: FormFixture.connector) == [
                "USB-A", "USB-C", "Lightning",
            ])
        #expect(
            InventoryFormChoices.options(for: FormFixture.connector, matching: "usb") == [
                "USB-A", "USB-C",
            ])
        #expect(InventoryFormChoices.options(for: FormFixture.connector, matching: "HDMI").isEmpty)
        let undeclared = InventoryFieldDefinition(key: "use", label: "Use", kind: .choice)
        #expect(InventoryFormChoices.options(for: undeclared).isEmpty)
    }

    @Test("a value outside the declared choices is neither kept by the draft nor stored")
    func undeclaredChoiceNeverReachesTheCommand() throws {
        var draft = InventoryItemDraft(id: "new-1")
        draft.name = "Cable"
        draft.typeKey = "cable"
        draft.set(.choice("HDMI"), for: FormFixture.connector)
        #expect(draft.fields["end_a"] == nil)

        draft.set(.choice("USB-C"), for: FormFixture.connector)
        let fields = try #require(createdItem(draft)?.fields)
        #expect(fields == ["end_a": .choice("USB-C")])

        let drifted = InventoryFieldEntry.choice("Micro-USB").value(for: FormFixture.connector)
        #expect(drifted == .success(nil))
    }

    @Test("only a long choice list is searchable")
    func longChoiceListsAreSearchable() {
        #expect(!InventoryFormChoices.isSearchable(FormFixture.connector))
        let long = InventoryFieldDefinition(
            key: "plug", label: "Plug", kind: .choice, choices: (1...9).map { "Type \($0)" })
        #expect(InventoryFormChoices.isSearchable(long))
    }

    @Test("a field with no value shows nothing, and only the choice list names clearing it")
    func emptyFieldsAreBlank() {
        #expect(InventoryFormBlank.placeholder.isEmpty)
        #expect(InventoryFormBlank.shown(nil).isEmpty)
        #expect(InventoryFormBlank.shown("USB-C") == "USB-C")
        #expect(InventoryFormChoiceList.clearTitle == "None")
    }

    @Test("a measurement keeps the unit it was typed in rather than the field's default")
    func measurementKeepsTypedUnit() throws {
        var draft = InventoryItemDraft(id: "new-1")
        draft.name = "Cable"
        draft.typeKey = "cable"
        let blank = draft.entry(for: FormFixture.length, units: FormFixture.units)
        #expect(blank == .measurement(amount: "", unit: "m"))

        draft.set(.measurement(amount: "250", unit: "cm"), for: FormFixture.length)

        let fields = try #require(createdItem(draft)?.fields)
        #expect(fields["length"] == .measurement(InventoryMeasurement(value: 250, unit: "cm")))
    }

    @Test("an existing measurement opens in its stored unit, not the default")
    func editingKeepsStoredUnit() {
        let stored = FormFixture.item(
            "item-1", "Cable", typeKey: "cable",
            fields: ["length": .measurement(InventoryMeasurement(value: 1.5, unit: "mm"))])
        let draft = InventoryItemDraft(editing: stored, placementName: nil)
        #expect(
            draft.entry(for: FormFixture.length, units: FormFixture.units)
                == .measurement(amount: "1.5", unit: "mm"))
    }

    @Test("a unit picker offers every unit of the field's dimension and no other")
    func unitsFollowDimension() {
        #expect(
            InventoryFormUnits.options(for: FormFixture.length, in: FormFixture.units) == [
                "mm", "cm", "m",
            ])
        #expect(
            InventoryFormUnits.options(for: FormFixture.wattage, in: FormFixture.units) == ["W"])
    }

    @Test(
        "a figure that is not a number, a reversed range and a missing required field block the form"
    )
    func malformedValuesAreIssues() {
        var draft = InventoryItemDraft(id: "new-1")
        draft.name = "Charger"
        draft.typeKey = "charger"
        #expect(issues(draft) == [.fieldMissing(label: "Wattage")])

        draft.set(.measurement(amount: "twenty", unit: "W"), for: FormFixture.wattage)
        #expect(issues(draft) == [.notANumber(label: "Wattage")])

        draft.set(.measurement(amount: "20,5", unit: "W"), for: FormFixture.wattage)
        #expect(issues(draft).isEmpty)

        let span = InventoryFieldDefinition(
            key: "span", label: "Span", kind: .range, dimension: "length")
        #expect(
            InventoryFieldEntry.range(low: "5", high: "2", unit: "m").value(for: span)
                == .failure(.rangeReversed(label: "Span")))
    }

    @Test("fields of a type no longer chosen are not stored")
    func switchingTypeDropsTheOldTypesFields() throws {
        var draft = InventoryItemDraft(id: "new-1")
        draft.name = "Thing"
        draft.typeKey = "cable"
        draft.set(.choice("USB-A"), for: FormFixture.connector)
        draft.typeKey = "charger"
        draft.set(.measurement(amount: "30", unit: "W"), for: FormFixture.wattage)

        let fields = try #require(createdItem(draft)?.fields)
        #expect(fields == ["wattage": .measurement(InventoryMeasurement(value: 30, unit: "W"))])
    }

    private func issues(_ draft: InventoryItemDraft) -> [InventoryDraftIssue] {
        InventoryItemFormSubmission.issues(for: draft, catalogue: FormFixture.catalogue)
    }

    private func createdItem(_ draft: InventoryItemDraft) -> InventoryNewItem? {
        guard
            case .createItem(let item) = InventoryItemFormSubmission.create(
                draft, catalogue: FormFixture.catalogue
            ).first
        else { return nil }
        return item
    }
}
