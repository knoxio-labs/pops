import AppCore
import Foundation
import Testing

@testable import InventoryReplica

/// ``CatalogueReplacement`` through ``CatalogueRebase``: a value on a
/// definition the server named as replaced moves onto the replacement only
/// when the replacement accepts it as it is, by the server's own shape rule.
@Suite("Catalogue replacement")
internal struct CatalogueReplacementTests {
    private typealias Fixture = RebaseFixture

    private static let brightness = "99999999-9999-4999-8999-999999999999"
    private static let router = "88888888-8888-4888-8888-888888888888"
    private static let archived = "2026-09-02T00:00:00.000Z"

    /// Lumens archived in favour of `replacement`, colour untouched.
    private static func next(replacement: InventoryCatalogueField) -> [InventoryCatalogueField] {
        [
            Fixture.field(
                Fixture.lumens, key: "lumens", kind: .measurement, sortOrder: 0,
                archivedAt: archived, fixedUnit: "lm"),
            Fixture.baseFields[1], replacement,
        ]
    }

    private static let lumensReplaced = Fixture.change(
        .field, Fixture.lumens, .replaced, replacementId: brightness)

    private static func lumensEdit() throws -> InventoryCommand {
        Fixture.edit(Fixture.lumens, try Fixture.measurement())
    }

    @Test("a replacement of the same kind and unit takes the value, and the change is sent")
    func sameShapeMoves() throws {
        let fields = Self.next(
            replacement: Fixture.field(
                Self.brightness, key: "brightness", kind: .measurement, sortOrder: 2,
                fixedUnit: "lm"))
        var base = Fixture.baseFields
        base[0] = Fixture.field(
            Fixture.lumens, key: "lumens", kind: .measurement, sortOrder: 0, fixedUnit: "lm")

        let verdict = try Fixture.verdict(
            try Self.lumensEdit(), next: fields, known: [Self.lumensReplaced], base: base)

        #expect(
            verdict
                == .rebased(
                    .command(
                        .editProtocol2Item(
                            id: Fixture.lampId, catalogueRevision: 2,
                            values: [
                                InventoryProtocol2FieldPatch(
                                    fieldId: Self.brightness, values: [try Fixture.measurement()])
                            ])), revision: 2))
    }

    @Test("a replacement in another unit refuses, and the repair names the replacement")
    func otherUnitRefuses() throws {
        let fields = Self.next(
            replacement: Fixture.field(
                Self.brightness, key: "brightness", kind: .measurement, sortOrder: 2,
                fixedUnit: "cd"))
        var base = Fixture.baseFields
        base[0] = Fixture.field(
            Fixture.lumens, key: "lumens", kind: .measurement, sortOrder: 0, fixedUnit: "lm")

        let verdict = try Fixture.verdict(
            try Self.lumensEdit(), next: fields, known: [Self.lumensReplaced], base: base)

        #expect(verdict == .incompatible([Self.lumensReplaced]))
    }

    @Test("a replacement of another kind refuses")
    func otherKindRefuses() throws {
        let fields = Self.next(
            replacement: Fixture.field(
                Self.brightness, key: "brightness", kind: .decimal, sortOrder: 2))

        let verdict = try Fixture.verdict(
            try Self.lumensEdit(), next: fields, known: [Self.lumensReplaced])

        #expect(verdict == .incompatible([Self.lumensReplaced]))
    }

    @Test("a replacement this phone does not have yet refuses")
    func missingReplacementRefuses() throws {
        let fields = [
            Fixture.field(
                Fixture.lumens, key: "lumens", kind: .measurement, sortOrder: 0,
                archivedAt: Self.archived),
            Fixture.baseFields[1],
        ]

        let verdict = try Fixture.verdict(
            try Self.lumensEdit(), next: fields, known: [Self.lumensReplaced])

        #expect(verdict == .incompatible([Self.lumensReplaced]))
    }

    @Test("without a named replacement an archived field is only archived")
    func archivedWithoutReplacement() throws {
        let fields = Self.next(
            replacement: Fixture.field(
                Self.brightness, key: "brightness", kind: .measurement, sortOrder: 2))

        let verdict = try Fixture.verdict(try Self.lumensEdit(), next: fields)

        #expect(verdict == .incompatible([Fixture.change(.field, Fixture.lumens, .archived)]))
    }

    @Test("a replaced type takes a new item whose every field has a replacement in it")
    func replacedTypeTakesCreate() throws {
        let routerLumens = "77777777-7777-4777-8777-777777777777"
        let lumensOnly = InventoryCommand.createProtocol2Item(
            InventoryNewProtocol2Item(
                id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Bulb", catalogueRevision: 1,
                typeId: Fixture.typeId,
                values: [
                    InventoryProtocol2FieldValue(
                        fieldId: Fixture.lumens, values: [try Fixture.measurement()])
                ], placement: .hand))
        let router: Fixture.ExtraType = (
            Self.router, [Fixture.field(Fixture.baseFields[0], of: Self.router, id: routerLumens)]
        )
        let typeReplaced = InventoryCatalogueChange(
            definition: .type, id: Fixture.typeId, typeId: Fixture.typeId, change: .replaced,
            replacementId: Self.router, revision: 2)
        let lumensReplaced = Fixture.change(
            .field, Fixture.lumens, .replaced, replacementId: routerLumens)

        let accepted = try Fixture.verdict(
            lumensOnly, next: Fixture.baseFields, known: [typeReplaced, lumensReplaced],
            extraType: router)
        let refused = try Fixture.verdict(
            lumensOnly, next: Fixture.baseFields, known: [typeReplaced], extraType: router)

        guard case .rebased(.command(.createProtocol2Item(let moved)), 2) = accepted else {
            Issue.record("expected the create to move onto the replacement, got \(accepted)")
            return
        }
        #expect(moved.typeId == Self.router)
        #expect(moved.values.map(\.fieldId) == [routerLumens])
        #expect(refused == .incompatible([typeReplaced]))
    }

    @Test("a replaced type never takes an edit, which keeps the item's own type")
    func replacedTypeRefusesEdit() throws {
        let typeReplaced = InventoryCatalogueChange(
            definition: .type, id: Fixture.typeId, typeId: Fixture.typeId, change: .replaced,
            replacementId: Self.router, revision: 2)

        let verdict = try Fixture.verdict(
            Fixture.edit(Fixture.colour, .enumeration(optionId: Fixture.warm)),
            next: Fixture.baseFields, known: [typeReplaced],
            extraType: (Self.router, []))

        #expect(verdict == .incompatible([typeReplaced]))
    }
}
