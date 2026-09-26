import AppCore
import Foundation
import Testing

@testable import InventoryReplica

/// ``CatalogueReplacement`` moving a new item that carries a computed-field
/// override onto its type's replacement: the override lands only on a live
/// computed field of the replacement that allows overrides, the rule the
/// server's `moveOntoReplacements` applies.
@Suite("Catalogue replacement: a create's override")
internal struct CatalogueReplacementOverrideTests {
    private typealias Fixture = RebaseFixture

    private static let glow = "12121212-1212-4121-8121-121212121212"
    private static let router = "88888888-8888-4888-8888-888888888888"
    private static let routerLumens = "77777777-7777-4777-8777-777777777777"
    private static let routerGlow = "66666666-6666-4666-8666-666666666666"

    private static func computed(_ id: String, of owner: String, allowOverride: Bool)
        -> InventoryCatalogueField
    {
        InventoryCatalogueField(
            id: id, typeId: owner, key: "glow", label: "Glow", sortOrder: 2, kind: .boolean,
            cardinality: .one, required: false, storage: .computed, expressionVersion: 1,
            expression: .boolean(true), allowOverride: allowOverride)
    }

    private static let base =
        Fixture.baseFields + [computed(glow, of: Fixture.typeId, allowOverride: true)]

    private static func create() throws -> InventoryCommand {
        .createProtocol2Item(
            InventoryNewProtocol2Item(
                id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Bulb", catalogueRevision: 1,
                typeId: Fixture.typeId,
                values: [.init(fieldId: Fixture.lumens, values: [try Fixture.measurement()])],
                overrides: [.init(fieldId: glow, values: [.boolean(false)])], placement: .hand))
    }

    private static let typeReplaced = InventoryCatalogueChange(
        definition: .type, id: Fixture.typeId, typeId: Fixture.typeId, change: .replaced,
        replacementId: router, revision: 2)

    private static func verdict(allowOverride: Bool) throws -> CatalogueRebase.Verdict {
        let router: Fixture.ExtraType = (
            Self.router,
            [
                Fixture.field(Fixture.baseFields[0], of: Self.router, id: routerLumens),
                computed(routerGlow, of: Self.router, allowOverride: allowOverride),
            ]
        )
        return try Fixture.verdict(
            try create(), next: base,
            known: [
                typeReplaced,
                Fixture.change(.field, Fixture.lumens, .replaced, replacementId: routerLumens),
                Fixture.change(.field, glow, .replaced, replacementId: routerGlow),
            ], base: base, extraType: router)
    }

    @Test("the override moves onto a replacement computed field of the same shape that allows one")
    func overrideMoves() throws {
        let verdict = try Self.verdict(allowOverride: true)

        guard case .rebased(.command(.createProtocol2Item(let moved)), 2) = verdict else {
            Issue.record("expected the create to move onto the replacement, got \(verdict)")
            return
        }
        #expect(moved.typeId == Self.router)
        #expect(moved.values.map(\.fieldId) == [Self.routerLumens])
        #expect(moved.overrides.map(\.fieldId) == [Self.routerGlow])
        #expect(moved.overrides.map(\.values) == [[.boolean(false)]])
    }

    @Test("a replacement computed field that refuses overrides keeps the create off the type")
    func overrideRefused() throws {
        let verdict = try Self.verdict(allowOverride: false)

        guard case .incompatible(let refused) = verdict else {
            Issue.record("expected the create to go to repair, got \(verdict)")
            return
        }
        #expect(refused.contains(Self.typeReplaced))
    }
}
