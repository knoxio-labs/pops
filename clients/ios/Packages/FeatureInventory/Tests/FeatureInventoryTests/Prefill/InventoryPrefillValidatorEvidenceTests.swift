import AppCore
import Testing

@testable import FeatureInventory

@Suite("Inventory prefill evidence validation")
internal struct InventoryPrefillValidatorEvidenceTests {
    @Test("captured text preserves contiguous reading order across line wraps")
    func validatesWrappedTextAndBooleanEvidence() {
        let name = InventoryPrefillTestSupport.field(id: "name")
        let battery = InventoryPrefillTestSupport.field(id: "battery", kind: .boolean)

        #expect(
            InventoryPrefillValidator.validate(
                ["name": .text("The Hobbit")],
                fields: [name],
                source: .text(["The", "Hobbit"])
            ) == ["name": [.string("The Hobbit")]]
        )
        #expect(
            InventoryPrefillValidator.validate(
                ["battery": .flag(false)],
                fields: [battery],
                source: .text(["Battery not", "present"])
            ) == ["battery": [.boolean(false)]]
        )
    }

    @Test("captured text evidence rejects reordered and invented words")
    func rejectsInvalidWrappedTextEvidence() {
        let name = InventoryPrefillTestSupport.field(id: "name")

        #expect(
            InventoryPrefillValidator.validate(
                ["name": .text("The Hobbit")],
                fields: [name],
                source: .text(["Hobbit", "The"])
            ).isEmpty
        )
        #expect(
            InventoryPrefillValidator.validate(
                ["name": .text("The Lord Hobbit")],
                fields: [name],
                source: .text(["The", "Hobbit"])
            ).isEmpty
        )
    }

    @Test("wrapped numeric colons remain part of the evidence span")
    func validatesWrappedTextWithNumericColon() {
        let name = InventoryPrefillTestSupport.field(id: "name")

        #expect(
            InventoryPrefillValidator.validate(
                ["name": .text("The Book of 20:20 Vision")],
                fields: [name],
                source: .text(["The Book of", "20:20 Vision"])
            ) == ["name": [.string("The Book of 20:20 Vision")]]
        )
    }

    @Test("wrapped subtitle colons remain part of the evidence span")
    func validatesWrappedTextWithSubtitleColon() {
        let name = InventoryPrefillTestSupport.field(id: "name")

        #expect(
            InventoryPrefillValidator.validate(
                ["name": .text("The Book of Fellowship of the Ring: Extended Edition")],
                fields: [name],
                source: .text(["The Book of", "Fellowship of the Ring: Extended Edition"])
            ) == [
                "name": [.string("The Book of Fellowship of the Ring: Extended Edition")]
            ]
        )
    }

    @Test("labelled OCR lines do not form one evidence span")
    func rejectsTextJoinedAcrossLabelledLines() {
        let name = InventoryPrefillTestSupport.field(id: "name")

        #expect(
            InventoryPrefillValidator.validate(
                ["name": .text("Frank Destination")],
                fields: [name],
                source: .text(["Author: Frank", "Destination: Bin"])
            ).isEmpty
        )
    }

    @Test("labelled OCR lines do not require a space after the colon")
    func rejectsTextJoinedAcrossUnspacedLabelledLines() {
        let name = InventoryPrefillTestSupport.field(id: "name")

        #expect(
            InventoryPrefillValidator.validate(
                ["name": .text("Frank Destination")],
                fields: [name],
                source: .text(["Author:Frank", "Destination:Bin"])
            ).isEmpty
        )
    }

    @Test("blank OCR lines terminate a continuation span")
    func rejectsTextJoinedAcrossBlankLines() {
        let name = InventoryPrefillTestSupport.field(id: "name")

        #expect(
            InventoryPrefillValidator.validate(
                ["name": .text("The Hobbit")],
                fields: [name],
                source: .text(["The", "", "Hobbit"])
            ).isEmpty
        )
    }

    @Test("negation cannot cross a labelled OCR line")
    func rejectsNegationAcrossLabelledLines() {
        let battery = InventoryPrefillTestSupport.field(id: "battery", kind: .boolean)

        #expect(
            InventoryPrefillValidator.validate(
                ["battery": .flag(false)],
                fields: [battery],
                source: .text(["Condition: not", "Presence: present"])
            ).isEmpty
        )
    }

    @Test("product facts remain separate evidence values")
    func rejectsTextJoinedAcrossProductFacts() {
        let name = InventoryPrefillTestSupport.field(id: "name")

        #expect(
            InventoryPrefillValidator.validate(
                ["name": .text("The Hobbit")],
                fields: [name],
                source: .product([
                    .init(label: "Title", value: "The"),
                    .init(label: "Subtitle", value: "Hobbit"),
                ])
            ).isEmpty
        )
    }
}
